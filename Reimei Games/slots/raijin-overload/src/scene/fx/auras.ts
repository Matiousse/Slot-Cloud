// Aura emitters ("charging" energy around a point): rising electric motes and
// embers, fast vertical energy streaks, motes converging into the centre,
// imploding energy rings, crackling micro-arcs and a breathing glow.
// Pooled emitters; each one drives the shared particle / flare / bolt pools.

import * as THREE from 'three';
import type { Bolts, BoltOpts } from './bolts';
import { Flares, FK_GLOW, FK_RING } from './flares';
import { Particles, PK_EMBER, PK_MOTE, PK_SPARK } from './particles';
import { rand, smooth, type FxShared } from './util';

const S = 16;
const X = 0, Y = 1, Z = 2, LEFT = 3, CR = 5, CG = 6, CB = 7, ACC = 8, ARC = 9, ON = 10, ACC2 = 11, AGE = 12, RING = 13, ACC3 = 14;

const _col = new THREE.Color();
const _hot = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Auras {
  private st: Float32Array;
  private glow: Int32Array;
  private arcOpts: BoltOpts = { width: 0.03, color: new THREE.Color(), duration: 140, branches: 1, arc: true };

  constructor(readonly cap: number, _shared: FxShared, private particles: Particles, private flares: Flares, private bolts: Bolts) {
    this.st = new Float32Array(cap * S);
    this.glow = new Int32Array(cap).fill(-1);
  }

  spawn(x: number, y: number, z: number, ms: number, color: THREE.Color) {
    const st = this.st;
    let i = -1, oldest = 0, best = 1e12;
    for (let j = 0; j < this.cap; j++) {
      if (st[j * S + ON] === 0) { i = j; break; }
      if (st[j * S + LEFT] < best) { best = st[j * S + LEFT]; oldest = j; }
    }
    if (i < 0) i = oldest;
    const o = i * S;
    st[o + X] = x; st[o + Y] = y; st[o + Z] = z;
    st[o + LEFT] = ms; st[o + AGE] = 0;
    st[o + CR] = color.r; st[o + CG] = color.g; st[o + CB] = color.b;
    st[o + ACC] = 0; st[o + ACC2] = 0; st[o + ACC3] = 0; st[o + ARC] = rand(30, 90); st[o + RING] = 60; st[o + ON] = 1;
    const f = this.flares.spec;
    f.kind = FK_GLOW; f.x = x; f.y = y; f.z = z - 0.05; f.life = ms + 120; f.delay = 0;
    f.size0 = 1.25; f.size1 = 1.35; f.sx = 1; f.sy = 1.3; f.alpha = 1; f.rise = 0; f.pow = 0; f.ease = 1; f.rot = 0;
    this.flares.setColor(color, 0.35);
    this.flares.kill(this.glow[i]);
    this.glow[i] = this.flares.emit();
  }

  update(dt: number) {
    const st = this.st, ps = this.particles, sp = ps.spec;
    for (let i = 0; i < this.cap; i++) {
      const o = i * S;
      if (st[o + ON] === 0) continue;
      const left = st[o + LEFT] - dt;
      const age = (st[o + AGE] += dt);
      if (left <= 0) {
        st[o + ON] = 0;
        this.flares.kill(this.glow[i]);
        this.glow[i] = -1;
        continue;
      }
      st[o + LEFT] = left;
      const env = smooth(age / 220) * smooth(left / 320);
      _col.setRGB(st[o + CR], st[o + CG], st[o + CB]);
      _hot.copy(_white).lerp(_col, 0.3);
      const cx = st[o + X], cy = st[o + Y], cz = st[o + Z];
      this.flares.setExt(this.glow[i], env * (0.75 + 0.2 * Math.sin(age * 0.011) + 0.1 * Math.sin(age * 0.047)));
      // rising motes + embers from a ring framing the cell
      st[o + ACC] += dt * 0.12 * env;
      while (st[o + ACC] >= 1) {
        st[o + ACC] -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = rand(0.4, 0.68);
        const ca = Math.cos(a), sa = Math.sin(a);
        const sw = rand(0.2, 0.6);
        sp.x = cx + ca * r; sp.y = cy + sa * r; sp.z = cz + rand(-0.15, 0.25);
        sp.vx = -sa * sw + ca * 0.1; sp.vy = ca * sw * 0.4 + rand(0.5, 1.5); sp.vz = rand(-0.05, 0.25);
        const ember = Math.random() < 0.35;
        sp.kind = ember ? PK_EMBER : PK_MOTE;
        sp.life = rand(700, 1500);
        sp.size0 = ember ? rand(0.03, 0.05) : rand(0.045, 0.1);
        sp.size1 = 0.004;
        if (ember) ps.colors(_white, 4.5, _col, 2.4);
        else ps.colors(_col, 3.4, _col, 1.5);
        sp.alpha = 1; sp.drag = 0.6; sp.grav = -0.8; sp.turb = 1.8; sp.stretch = ember ? 0.03 : 0;
        sp.fadeIn = 0.12; sp.colorT = 0.45; sp.fadeOut = 0.45; sp.spin = 0;
        ps.emit();
      }
      // converging motes: energy gathered into the centre
      st[o + ACC3] += dt * 0.045 * env;
      while (st[o + ACC3] >= 1) {
        st[o + ACC3] -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = rand(0.9, 1.3);
        const life = rand(360, 520);
        const v = (r - 0.3) / (life * 0.001);
        const ca = Math.cos(a), sa = Math.sin(a);
        sp.x = cx + ca * r; sp.y = cy + sa * r; sp.z = cz + rand(0, 0.2);
        sp.vx = -ca * v; sp.vy = -sa * v; sp.vz = 0;
        sp.kind = PK_SPARK; sp.life = life; sp.size0 = rand(0.014, 0.022); sp.size1 = 0.012;
        ps.colors(_col, 2.0, _hot, 3.2);
        sp.alpha = 1; sp.drag = 0; sp.grav = 0; sp.turb = 0; sp.stretch = 0.06;
        sp.fadeIn = 0.3; sp.colorT = 0.8; sp.fadeOut = 0.6; sp.spin = 0;
        ps.emit();
      }
      // fast vertical energy streaks
      st[o + ACC2] += dt * 0.04 * env;
      while (st[o + ACC2] >= 1) {
        st[o + ACC2] -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = rand(0.2, 0.62);
        sp.x = cx + Math.cos(a) * r; sp.y = cy - rand(0.2, 0.6); sp.z = cz + rand(-0.1, 0.25);
        sp.vx = rand(-0.15, 0.15); sp.vy = rand(2.4, 4.2); sp.vz = 0;
        sp.kind = PK_SPARK; sp.life = rand(320, 560); sp.size0 = rand(0.016, 0.028); sp.size1 = 0.006;
        ps.colors(_white, 6.5, _col, 2.6);
        sp.alpha = 1; sp.drag = 1.1; sp.grav = 0; sp.turb = 0.5; sp.stretch = 0.1;
        sp.fadeIn = 0.1; sp.colorT = 0.25; sp.fadeOut = 0.4; sp.spin = 0;
        ps.emit();
      }
      // imploding energy rings
      st[o + RING] -= dt;
      if (st[o + RING] <= 0 && left > 300) {
        st[o + RING] = rand(360, 460);
        const f = this.flares.spec;
        f.kind = FK_RING; f.x = cx; f.y = cy; f.z = cz; f.life = 440; f.delay = 0;
        f.size0 = 1.25; f.size1 = 0.68; f.sx = 1; f.sy = 1; f.alpha = env; f.rise = 0.3; f.pow = 1.6; f.ease = 2; f.rot = 0;
        f.a0 = 0.84; f.a1 = 0.84; f.b0 = 0.02; f.b1 = 0.07;
        this.flares.setColor(_col, 2.2);
        this.flares.emit();
      }
      // crackling micro arcs
      st[o + ARC] -= dt;
      if (st[o + ARC] <= 0 && env > 0.3) {
        st[o + ARC] = rand(55, 130);
        const a0 = Math.random() * Math.PI * 2;
        const r0 = rand(0.1, 0.35);
        const a1 = a0 + rand(0.5, 1.4) * (Math.random() < 0.5 ? -1 : 1);
        const r1 = rand(0.5, 0.85);
        _a.set(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cz + rand(0, 0.2));
        _b.set(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, cz + rand(-0.1, 0.25));
        const ao = this.arcOpts;
        ao.color.copy(_col).lerp(_white, 0.1);
        ao.width = rand(0.024, 0.04);
        ao.duration = rand(90, 170);
        ao.branches = Math.random() < 0.6 ? 1 : 2;
        this.bolts.spawn(_a, _b, ao);
      }
    }
  }
}
