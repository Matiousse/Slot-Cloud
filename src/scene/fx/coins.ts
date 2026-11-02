// Gold Japanese mon coins (round, square hole, raised outer + inner rims,
// embossed kanji 雷 神 電 力 around the hole) as one InstancedMesh with
// tumbling rigid-body-ish physics. 'rain' falls from the top of the view,
// 'fountain' erupts from below the board. Pooled: fixed instance capacity,
// spawn queue spreads big requests over time.

import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import delaKanji from '../../assets/fonts/dela-kanji.typeface.json';
import { MAT, PALETTE } from '../materials';
import { Flares, FK_GLOW, FK_DISC } from './flares';
import { Particles, PK_GLINT, PK_EMBER, PK_SPARK } from './particles';
import { ndcToPlaneZ, rand, touch, towardCamera, type FxShared } from './util';

// coin dimensions (world units; a reel cell is 1)
const R = 0.27; // outer radius
const HOLE = 0.062; // square hole half size
const RIM_W = 0.04; // outer rim width
const IRIM_W = 0.03; // inner square rim width
const PLATE = 0.014; // recessed field half thickness
const RAISE = 0.024; // rim half thickness

// ---------------------------------------------------------------- geometry

function lathe(): THREE.BufferGeometry {
  // closed cross-section of the outer rim (r, z), rounded edges
  const ri = R - RIM_W;
  const zr = RAISE;
  const pts = [
    [ri, -PLATE], [ri - 0.002, -zr + 0.006], [ri + 0.005, -zr], [R - 0.012, -zr], [R - 0.004, -zr + 0.004],
    [R, -zr * 0.4], [R, zr * 0.4], [R - 0.004, zr - 0.004], [R - 0.012, zr], [ri + 0.005, zr], [ri - 0.002, zr - 0.006], [ri, PLATE],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, 44);
  g.rotateX(Math.PI / 2); // lathe axis Y -> Z
  return g;
}

function plateCaps(): THREE.BufferGeometry[] {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, R - RIM_W + 0.012, 0, Math.PI * 2, false);
  const h = HOLE + IRIM_W * 0.5;
  const hole = new THREE.Path();
  hole.moveTo(-h, -h);
  hole.lineTo(-h, h);
  hole.lineTo(h, h);
  hole.lineTo(h, -h);
  hole.lineTo(-h, -h);
  sh.holes.push(hole);
  const front = new THREE.ShapeGeometry(sh, 14);
  front.translate(0, 0, PLATE);
  const back = new THREE.ShapeGeometry(sh, 14);
  back.rotateY(Math.PI);
  back.translate(0, 0, -PLATE);
  return [front, back];
}

function innerRim(): THREE.BufferGeometry {
  const bev = 0.007;
  const o = HOLE + IRIM_W - bev;
  const i = HOLE + bev;
  const sh = new THREE.Shape();
  sh.moveTo(-o, -o);
  sh.lineTo(o, -o);
  sh.lineTo(o, o);
  sh.lineTo(-o, o);
  sh.lineTo(-o, -o);
  const hole = new THREE.Path();
  hole.moveTo(-i, -i);
  hole.lineTo(-i, i);
  hole.lineTo(i, i);
  hole.lineTo(i, -i);
  hole.lineTo(-i, -i);
  sh.holes.push(hole);
  const depth = RAISE * 2 - bev * 2;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return toCreasedNormals(g, Math.PI / 3.2);
}

/** Merge position/normal, recompute planar face UVs (texture spans the coin diameter). */
function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i));
      N.push(n.getX(i), n.getY(i), n.getZ(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const uv: number[] = [];
  for (let i = 0; i < P.length; i += 3) uv.push(P[i] / (2 * R) + 0.5, P[i + 1] / (2 * R) + 0.5);
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- textures

const TEX = 256;

/** Height map: kanji emboss, lathe rings, wear dents. Returns normal, albedo and roughness maps. */
function coinMaps(): { normal: THREE.Texture; color: THREE.Texture; rough: THREE.Texture } {
  const ppu = TEX / (2 * R); // pixels per world unit
  const cx = TEX / 2;
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEX, TEX);
  // kanji glyphs from the bundled typeface (no system CJK font needed)
  const font = new FontLoader().parse(delaKanji as never);
  const ringR = (HOLE + IRIM_W + (R - RIM_W)) / 2 + 0.004;
  const glyphSize = 0.098;
  const chars: [string, number, number][] = [['雷', 0, ringR], ['神', 0, -ringR], ['電', ringR, 0], ['力', -ringR, 0]];
  ctx.fillStyle = '#fff';
  for (const [ch, gx, gy] of chars) {
    const shapes = font.generateShapes(ch, glyphSize);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const polys = shapes.map((s) => {
      const ex = s.extractPoints(6);
      for (const p of ex.shape) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      return ex;
    });
    const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
    const map = (p: THREE.Vector2): [number, number] => [cx + (gx + p.x - ox) * ppu, cx - (gy + p.y - oy) * ppu];
    ctx.beginPath();
    for (const ex of polys) {
      for (const ring of [ex.shape, ...ex.holes]) {
        ring.forEach((p, i) => {
          const [X, Y] = map(p);
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.closePath();
      }
    }
    ctx.fill('evenodd');
  }
  const img = ctx.getImageData(0, 0, TEX, TEX).data;
  // height field
  const H = new Float32Array(TEX * TEX);
  for (let i = 0; i < TEX * TEX; i++) H[i] = img[i * 4] / 255;
  // soft bevel: two box-blur passes
  const tmp = new Float32Array(TEX * TEX);
  const blur = (src: Float32Array, dst: Float32Array, dx: number, dy: number, r: number) => {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + dx * k, yy = y + dy * k;
          if (xx < 0 || yy < 0 || xx >= TEX || yy >= TEX) continue;
          s += src[yy * TEX + xx];
          n++;
        }
        dst[y * TEX + x] = s / n;
      }
  };
  blur(H, tmp, 1, 0, 1);
  blur(tmp, H, 0, 1, 1);
  const kanjiMask = Float32Array.from(H);
  // lathe rings + hammered wear on the recessed field
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dents: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, rr = (HOLE + IRIM_W + rnd() * (R - RIM_W - HOLE - IRIM_W)) * ppu;
    dents.push([cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, 1.5 + rnd() * 3.5, 0.08 + rnd() * 0.12]);
  }
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cx;
      const r = Math.hypot(dx, dy) / ppu;
      let h = H[y * TEX + x] * 0.9;
      if (r < R - RIM_W && Math.max(Math.abs(dx), Math.abs(dy)) / ppu > HOLE + IRIM_W) {
        h += 0.025 * Math.sin(r * ppu * 1.9) + 0.012 * Math.sin(r * ppu * 5.3);
        for (const [ddx, ddy, rad, depth] of dents) {
          const d = Math.hypot(x - ddx, y - ddy) / rad;
          if (d < 1) h -= depth * (1 - d * d) * (1 - d * d);
        }
      } else if (r >= R - RIM_W && r < R) {
        // rim top: very fine radial knurl wear
        const ang = Math.atan2(dy, dx);
        h += 0.02 * Math.sin(ang * 90);
      }
      H[y * TEX + x] = h;
    }
  const strength = 6;
  const nC = document.createElement('canvas');
  nC.width = nC.height = TEX;
  const nCtx = nC.getContext('2d')!;
  const nImg = nCtx.createImageData(TEX, TEX);
  const cC = document.createElement('canvas');
  cC.width = cC.height = TEX;
  const cCtx = cC.getContext('2d')!;
  const cImg = cCtx.createImageData(TEX, TEX);
  const rC = document.createElement('canvas');
  rC.width = rC.height = TEX;
  const rCtx = rC.getContext('2d')!;
  const rImg = rCtx.createImageData(TEX, TEX);
  const at = (x: number, y: number) => H[Math.min(TEX - 1, Math.max(0, y)) * TEX + Math.min(TEX - 1, Math.max(0, x))];
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const i = (y * TEX + x) * 4;
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cx) / ppu;
      let nx = 0, ny = 0;
      if (r < R * 0.985) {
        const hx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
        const hy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
        nx = -hx * strength;
        ny = hy * strength; // canvas y is down, texture v is up
      }
      const l = Math.hypot(nx, ny, 1);
      nImg.data[i] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      nImg.data[i + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      nImg.data[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      nImg.data[i + 3] = 255;
      // albedo: raised = bright polished gold, recesses = deeper patina
      const k = kanjiMask[y * TEX + x];
      const field = r < R - RIM_W && Math.max(Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cx)) / ppu > HOLE + IRIM_W ? 1 : 0;
      const dirt = field * (1 - k) * (0.75 + 0.25 * Math.sin(x * 0.37 + Math.sin(y * 0.21) * 3));
      cImg.data[i] = Math.round(255 * (1 - dirt * 0.45));
      cImg.data[i + 1] = Math.round(255 * (1 - dirt * 0.6));
      cImg.data[i + 2] = Math.round(255 * (1 - dirt * 0.8));
      cImg.data[i + 3] = 255;
      const rough = 0.12 + dirt * 0.42 + (1 - field) * 0.02;
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = Math.round(rough * 255);
      rImg.data[i + 3] = 255;
    }
  nCtx.putImageData(nImg, 0, 0);
  cCtx.putImageData(cImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  const normal = new THREE.CanvasTexture(nC);
  normal.colorSpace = THREE.NoColorSpace;
  const color = new THREE.CanvasTexture(cC);
  color.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(rC);
  rough.colorSpace = THREE.NoColorSpace;
  for (const t of [normal, color, rough]) t.anisotropy = 4;
  return { normal, color, rough };
}

// ---------------------------------------------------------------- system

const S = 22;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, QX = 6, QY = 7, QZ = 8, QW = 9;
const AX = 10, AY = 11, AZ = 12, W = 13, AGE = 14, LIFE = 15, SC = 16, GL = 17, MODE = 18, SPIN = 19;

const GRAVITY = 13;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _s = new THREE.Vector3();
const _lo = new THREE.Vector3();
const _hi = new THREE.Vector3();
const _tc = new THREE.Vector3();
const _gold = new THREE.Color(PALETTE.gold);
const _white = new THREE.Color(1, 0.95, 0.8);
const _amber = new THREE.Color(0xff8a1a);

export class Coins {
  readonly mesh: THREE.InstancedMesh;
  private st: Float32Array;
  private count = 0;
  private rainLeft = 0;
  private rainRate = 0;
  private rainAcc = 0;
  private fountLeft = 0;
  private fountRate = 0;
  private fountAcc = 0;
  private fountGlow = -1;

  constructor(readonly cap: number, private shared: FxShared, private particles: Particles, private flares: Flares) {
    const geo = merge([lathe(), ...plateCaps(), innerRim()]);
    const maps = coinMaps();
    const mat = (MAT.gold() as THREE.MeshStandardMaterial).clone();
    mat.name = 'fx-coin-gold';
    mat.color.set(0xffc54a);
    mat.map = maps.color;
    mat.normalMap = maps.normal;
    mat.normalScale.set(1, 1);
    mat.roughnessMap = maps.rough;
    mat.roughness = 1;
    mat.metalness = 1;
    mat.envMapIntensity = 1.6;
    mat.emissive.set(0x2a1600);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx-coins';
    this.st = new Float32Array(cap * S);
  }

  get alive() {
    return this.count;
  }

  /** Queue `count` coins. Rain spreads over ~1-2.6 s, fountain bursts over ~0.5-1.2 s. */
  spawn(count: number, mode: 'rain' | 'fountain') {
    if (mode === 'rain') {
      this.rainLeft += count;
      const dur = Math.min(2600, 700 + this.rainLeft * 18);
      this.rainRate = this.rainLeft / dur;
    } else {
      this.fountLeft += count;
      const dur = Math.min(1200, 380 + this.fountLeft * 7);
      this.fountRate = this.fountLeft / dur;
      // geyser glow + burst at the source
      const f = this.flares.spec;
      f.kind = FK_GLOW; f.x = 0; f.y = -3.25; f.z = 1.8; f.life = dur + 500; f.delay = 0; f.size0 = 2.4; f.size1 = 3.2;
      f.sx = 1.5; f.sy = 0.7; this.flares.setColor(_gold, 0.55); f.alpha = 1; f.rise = 0.12; f.pow = 1.2; f.ease = 2; f.rot = 0;
      this.flares.kill(this.fountGlow);
      this.fountGlow = this.flares.emit();
      f.kind = FK_DISC; f.size0 = 1.2; f.size1 = 2.2; f.sx = 1.6; f.sy = 1; f.life = 260; f.rise = 0; f.pow = 2.5;
      this.flares.setColor(_white, 1.5);
      this.flares.emit();
    }
  }

  private add(mode: number) {
    if (this.count >= this.cap) return;
    const st = this.st, o = this.count++ * S;
    const cam = this.shared.camera;
    const z = rand(1, 3);
    if (mode === 0) {
      ndcToPlaneZ(cam, -1, 1, z, _lo);
      ndcToPlaneZ(cam, 1, 1, z, _hi);
      st[o + PX] = rand(_lo.x + 0.25, _hi.x - 0.25);
      st[o + PY] = _hi.y + rand(0.35, 1.2);
      st[o + PZ] = z;
      st[o + VX] = rand(-0.5, 0.5);
      st[o + VY] = -rand(0.5, 3.5);
      st[o + VZ] = rand(-0.15, 0.15);
    } else {
      st[o + PX] = rand(-1.3, 1.3);
      st[o + PY] = -3.3 + rand(-0.1, 0.1);
      st[o + PZ] = z;
      st[o + VX] = st[o + PX] * rand(1.4, 2.8) + rand(-1.2, 1.2);
      st[o + VY] = rand(8.4, 13);
      st[o + VZ] = rand(-0.3, 0.6);
    }
    _q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    st[o + QX] = _q.x; st[o + QY] = _q.y; st[o + QZ] = _q.z; st[o + QW] = _q.w;
    // tumble mostly around an in-plane axis (coin flip) with some wobble
    _ax.set(rand(-1, 1), rand(-1, 1), rand(-0.35, 0.35)).normalize();
    st[o + AX] = _ax.x; st[o + AY] = _ax.y; st[o + AZ] = _ax.z;
    st[o + W] = rand(6, 15) * (Math.random() < 0.5 ? -1 : 1);
    st[o + AGE] = 0;
    st[o + LIFE] = rand(5000, 7000);
    st[o + SC] = rand(0.82, 1.18);
    st[o + GL] = rand(100, 900);
    st[o + MODE] = mode;
    st[o + SPIN] = rand(0.6, 1.2);
    if (mode === 1) {
      // launch spark from the geyser
      const p = this.particles, s = p.spec;
      s.x = st[o + PX]; s.y = st[o + PY]; s.z = z; s.vx = st[o + VX] * 0.6; s.vy = st[o + VY] * 0.7; s.vz = 0;
      s.life = rand(220, 380); s.size0 = 0.026; s.size1 = 0.008; s.kind = PK_SPARK; s.stretch = 0.028;
      p.colors(_gold, 4.5, _amber, 2); s.alpha = 1; s.drag = 2.2; s.grav = 6; s.turb = 0; s.fadeIn = 0; s.colorT = 0.3; s.fadeOut = 0.3; s.spin = 0;
      p.emit();
    }
  }

  update(dt: number) {
    // spawn queues
    if (this.rainLeft > 0) {
      this.rainAcc += dt * this.rainRate;
      while (this.rainAcc >= 1 && this.rainLeft > 0) {
        this.rainAcc -= 1;
        this.rainLeft--;
        this.add(0);
      }
      if (this.rainLeft <= 0) this.rainAcc = 0;
    }
    if (this.fountLeft > 0) {
      this.fountAcc += dt * this.fountRate;
      while (this.fountAcc >= 1 && this.fountLeft > 0) {
        this.fountAcc -= 1;
        this.fountLeft--;
        this.add(1);
      }
      if (this.fountLeft <= 0) this.fountAcc = 0;
    }
    const st = this.st, k = dt * 0.001;
    const cam = this.shared.camera;
    ndcToPlaneZ(cam, 0, -1, 2, _lo);
    const bottom = _lo.y - 0.8;
    const ps = this.particles, sp = ps.spec;
    let i = 0;
    while (i < this.count) {
      const o = i * S;
      const age = st[o + AGE] + dt;
      let vy = st[o + VY];
      if (age >= st[o + LIFE] || (st[o + PY] < bottom && vy < 0)) {
        this.count--;
        if (i !== this.count) st.copyWithin(o, this.count * S, this.count * S + S);
        continue;
      }
      st[o + AGE] = age;
      // gravity + air drag (rain reaches a fluttery terminal velocity)
      const drag = st[o + MODE] === 0 ? 0.9 : 0.35;
      const d = 1 / (1 + drag * k);
      const vx = st[o + VX] * d;
      vy = (vy - GRAVITY * k) * d;
      const vz = st[o + VZ] * d;
      st[o + VX] = vx; st[o + VY] = vy; st[o + VZ] = vz;
      _p.set((st[o + PX] += vx * k), (st[o + PY] += vy * k), (st[o + PZ] += vz * k));
      // tumble
      _q.set(st[o + QX], st[o + QY], st[o + QZ], st[o + QW]);
      _ax.set(st[o + AX], st[o + AY], st[o + AZ]);
      _dq.setFromAxisAngle(_ax, st[o + W] * k);
      _q.multiply(_dq);
      st[o + QX] = _q.x; st[o + QY] = _q.y; st[o + QZ] = _q.z; st[o + QW] = _q.w;
      // scale-in pop
      const t = Math.min(1, age / 140);
      const pop = t < 1 ? t * (1 + 0.7 * (1 - t)) : 1;
      const sc = st[o + SC] * pop;
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      // sparkle glints when the face catches the light
      st[o + GL] -= dt;
      if (st[o + GL] <= 0) {
        st[o + GL] = rand(350, 1100);
        towardCamera(cam, _p, _tc);
        sp.x = _p.x + _tc.x * 0.08 + rand(-0.12, 0.12) * sc;
        sp.y = _p.y + _tc.y * 0.08 + rand(-0.12, 0.12) * sc;
        sp.z = _p.z + _tc.z * 0.08;
        sp.vx = vx * 0.9; sp.vy = vy * 0.9; sp.vz = vz * 0.9;
        sp.life = rand(180, 300); sp.size0 = rand(0.16, 0.26) * sc; sp.size1 = 0.02;
        sp.kind = PK_GLINT; sp.stretch = 0; ps.colors(_white, 7, _gold, 3); sp.alpha = 1; sp.drag = 0; sp.grav = 0; sp.turb = 0;
        sp.fadeIn = 0.25; sp.colorT = 0.6; sp.fadeOut = 0.35; sp.spin = rand(-3, 3);
        ps.emit();
      }
      // fountain: short ember trail on the way up
      if (st[o + MODE] === 1 && vy > 2 && Math.random() < dt / 45) {
        sp.x = _p.x; sp.y = _p.y; sp.z = _p.z; sp.vx = vx * 0.1; sp.vy = vy * 0.1; sp.vz = 0;
        sp.life = rand(280, 520); sp.size0 = 0.035; sp.size1 = 0.005; sp.kind = PK_EMBER; sp.stretch = 0;
        ps.colors(_gold, 4, _amber, 1.5); sp.alpha = 0.9; sp.drag = 1.5; sp.grav = 1.5; sp.turb = 0.5; sp.fadeIn = 0; sp.colorT = 0.5; sp.fadeOut = 0.2; sp.spin = 0;
        ps.emit();
      }
      i++;
    }
    this.mesh.count = this.count;
    if (this.count > 0) {
      const im = this.mesh.instanceMatrix;
      touch(im, this.count, 16);
    }
  }
}
