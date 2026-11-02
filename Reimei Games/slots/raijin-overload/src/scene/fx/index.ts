// FX module: spectacular additive effects under bloom.
//
//   bolt       jagged branching lightning (ribbon shader, flicker, leader, return stroke)
//              + impact: sparks, shockwave, flash, anamorphic streak, starburst,
//              crawling micro-arcs, local point-light flash, camera shake
//   sparks     velocity-stretched hot sparks, embers, soft motes
//   shockwave  electric plasma ring + echo ring + flash + radial spark ring
//   coins      instanced PBR gold mon coins (rain / fountain) with glints
//   aura       rising electric motes / streaks / micro-arcs / breathing glow
//
// Everything is pooled and driven by update(dt) (clock-scaled ms), zero
// allocations per frame after construction.

import * as THREE from 'three';
import type { Fx, SceneContext } from '../contracts';
import { PALETTE } from '../materials';
import { Auras } from './auras';
import { Bolts, type BoltOpts } from './bolts';
import { Coins } from './coins';
import { Flares, FK_DISC, FK_GLOW, FK_RING, FK_STAR, FK_STREAK } from './flares';
import { Particles, PK_EMBER, PK_MOTE, PK_SPARK } from './particles';
import { len3, rand, towardCamera, type FxShared } from './util';

const ARC_Q = 48; // scheduled micro-arc queue
const AQ = 8; // floats per entry: time, x, y, z, r, g, b, radius

export function createFx(ctx: SceneContext): Fx {
  const shared: FxShared = { camera: ctx.camera, uTime: { value: 0 }, uPx: { value: 0.001 } };
  const object = new THREE.Group();
  object.name = 'fx';

  const particles = new Particles(3000, shared);
  const flares = new Flares(160, shared);
  const bolts = new Bolts(24, shared);
  const coins = new Coins(220, shared, particles, flares);
  const auras = new Auras(10, shared, particles, flares, bolts);
  const light = new THREE.PointLight(0xbfefff, 0, 10, 2);
  light.name = 'fx-light';
  object.add(coins.mesh, bolts.group, particles.mesh, flares.mesh, light);

  // ---------------------------------------------------------------- scratch
  const _col = new THREE.Color();
  const _col2 = new THREE.Color();
  const _hot = new THREE.Color();
  const _cool = new THREE.Color();
  const DEEP_WARM = new THREE.Color(0xff3010);
  const DEEP_COOL = new THREE.Color(0x2a3cff);
  const _white = new THREE.Color(1, 1, 1);
  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();
  const _tc = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _v2 = new THREE.Vector2();
  const boltOpts: BoltOpts = { width: 0.06, color: new THREE.Color(), duration: 420, branches: 3, arc: false };
  const arcOpts: BoltOpts = { width: 0.025, color: new THREE.Color(), duration: 130, branches: 1, arc: true };
  const arcQ = new Float32Array(ARC_Q * AQ);
  let arcN = 0;
  let lightV = 0;
  let lightPeak = 0;
  /** recent-impact heat: stacked impacts share an exposure budget */
  let heat = 0;

  /** Pull an effect origin slightly toward the camera so it renders in front of symbols. */
  const nudge = (at: THREE.Vector3, amount: number, out: THREE.Vector3) => {
    towardCamera(ctx.camera, at, _tc);
    return out.copy(at).addScaledVector(_tc, amount);
  };

  const cameraBasis = () => {
    ctx.camera.updateMatrixWorld();
    _right.setFromMatrixColumn(ctx.camera.matrixWorld, 0);
    _up.setFromMatrixColumn(ctx.camera.matrixWorld, 1);
  };

  const flashLight = (at: THREE.Vector3, color: THREE.Color, strength: number) => {
    nudge(at, 1.7, light.position);
    light.color.copy(color).lerp(_white, 0.35);
    lightV = 1;
    lightPeak = 3.2 * strength;
  };

  const scheduleArcs = (at: THREE.Vector3, color: THREE.Color, n: number, radius: number, spread: number) => {
    for (let i = 0; i < n && arcN < ARC_Q; i++) {
      const o = arcN++ * AQ;
      arcQ[o] = (i / Math.max(1, n - 1)) * spread + rand(0, 40);
      arcQ[o + 1] = at.x; arcQ[o + 2] = at.y; arcQ[o + 3] = at.z;
      arcQ[o + 4] = color.r; arcQ[o + 5] = color.g; arcQ[o + 6] = color.b;
      arcQ[o + 7] = radius;
    }
  };

  // ---------------------------------------------------------------- building blocks

  const flare = (kind: number, at: THREE.Vector3, c: THREE.Color, k: number, size0: number, size1: number, life: number, pow: number, ease = 3, sx = 1, sy = 1, rot = 0, delay = 0, rise = 0) => {
    const f = flares.spec;
    f.kind = kind; f.x = at.x; f.y = at.y; f.z = at.z; f.size0 = size0; f.size1 = size1; f.life = life; f.pow = pow;
    f.ease = ease; f.sx = sx; f.sy = sy; f.rot = rot; f.delay = delay; f.rise = rise; f.alpha = 1;
    f.a0 = 0.78; f.a1 = 0.8; f.b0 = 0.2; f.b1 = 0.035;
    flares.setColor(c, k);
    return flares.emit();
  };

  const sparkBurst = (at: THREE.Vector3, n: number, color: THREE.Color, power: number) => {
    const ps = particles, s = ps.spec;
    towardCamera(ctx.camera, at, _tc);
    _hot.copy(_white).lerp(color, 0.18);
    // colour temperature: sparks cool toward deep red (warm hues) or deep blue (cool hues)
    _cool.copy(color).lerp(color.r > color.b ? DEEP_WARM : DEEP_COOL, 0.45);
    for (let i = 0; i < n; i++) {
      // random direction, biased toward the camera so sparks fly out of the board
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const l = len3(dx, dy, dz) || 1;
      dx = dx / l + _tc.x * 0.55; dy = dy / l + _tc.y * 0.55 + 0.25; dz = dz / l + _tc.z * 0.55;
      const l2 = len3(dx, dy, dz) || 1;
      dx /= l2; dy /= l2; dz /= l2;
      const r = Math.random();
      s.x = at.x + dx * 0.05; s.y = at.y + dy * 0.05; s.z = at.z + dz * 0.05;
      s.fadeIn = 0; s.spin = 0; s.alpha = 1;
      if (r < 0.1) {
        // hero sparks: long, fast, arcing out with gravity
        const sp = rand(7, 11) * power;
        s.vx = dx * sp; s.vy = dy * sp + 1.5; s.vz = dz * sp;
        s.kind = PK_SPARK; s.life = rand(650, 1000); s.size0 = rand(0.032, 0.045); s.size1 = 0.012;
        ps.colors(_hot, 9, _cool, 3);
        s.drag = 1.3; s.grav = 9; s.turb = 0; s.stretch = 0.05; s.colorT = 0.3; s.fadeOut = 0.45;
      } else if (r < 0.7) {
        const sp = rand(1.8, 6.5) * power;
        s.vx = dx * sp; s.vy = dy * sp; s.vz = dz * sp;
        s.kind = PK_SPARK; s.life = rand(320, 780); s.size0 = rand(0.017, 0.032); s.size1 = 0.008;
        ps.colors(_hot, 8, _cool, 2.8);
        s.drag = 2.2; s.grav = 7; s.turb = 0; s.stretch = 0.045; s.colorT = 0.22; s.fadeOut = 0.35;
      } else if (r < 0.92) {
        const sp = rand(0.6, 2.4) * power;
        s.vx = dx * sp; s.vy = dy * sp; s.vz = dz * sp;
        s.kind = PK_EMBER; s.life = rand(520, 1150); s.size0 = rand(0.028, 0.05); s.size1 = 0.004;
        ps.colors(_hot, 5, _cool, 1.8);
        s.drag = 1.6; s.grav = 2.2; s.turb = 2.2; s.stretch = 0; s.colorT = 0.4; s.fadeOut = 0.4;
      } else {
        const sp = rand(0.3, 1.1) * power;
        s.vx = dx * sp; s.vy = dy * sp; s.vz = dz * sp;
        s.kind = PK_MOTE; s.life = rand(220, 420); s.size0 = rand(0.09, 0.17); s.size1 = 0.02;
        ps.colors(color, 2.4, color, 0.8);
        s.drag = 2; s.grav = 0; s.turb = 0; s.stretch = 0; s.colorT = 0.6; s.fadeOut = 0.2;
      }
      ps.emit();
    }
  };

  const ring = (at: THREE.Vector3, c: THREE.Color, k: number, size0: number, size1: number, life: number, delay: number, a: number, b0: number, b1: number) => {
    const f = flares.spec;
    f.kind = FK_RING; f.x = at.x; f.y = at.y; f.z = at.z; f.size0 = size0; f.size1 = size1; f.life = life; f.delay = delay;
    f.pow = 1.4; f.ease = 4; f.sx = 1; f.sy = 1; f.rot = 0; f.rise = 0; f.alpha = 1;
    f.a0 = a; f.a1 = a; f.b0 = b0; f.b1 = b1;
    flares.setColor(c, k);
    return flares.emit();
  };

  const shock = (at: THREE.Vector3, color: THREE.Color, radius: number, g = 1) => {
    _hot.copy(_white).lerp(color, 0.3);
    // main plasma ring, echo ring (thin, whiter, delayed)
    ring(at, color, 2.1 * g, radius * 0.12, radius, 520, 0, 0.78, 0.09, 0.03);
    ring(at, _hot, 1.8 * g, radius * 0.1, radius * 0.7, 420, 70, 0.8, 0.08, 0.018);
    flare(FK_DISC, at, _hot, 1.3 * g, radius * 0.32, radius * 0.42, 100, 2.6, 2);
    flare(FK_GLOW, at, color, 0.1 * g, radius * 1.0, radius * 1.35, 520, 1.6, 2);
    // radial spark ring in the screen plane
    cameraBasis();
    const ps = particles, s = ps.spec;
    const n = Math.round(14 + radius * 12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.12, 0.12);
      const ca = Math.cos(a), sa = Math.sin(a);
      const sp = radius * rand(3.6, 6.4);
      s.x = at.x; s.y = at.y; s.z = at.z;
      s.vx = (_right.x * ca + _up.x * sa) * sp; s.vy = (_right.y * ca + _up.y * sa) * sp; s.vz = (_right.z * ca + _up.z * sa) * sp;
      s.kind = PK_SPARK; s.life = rand(240, 420); s.size0 = rand(0.016, 0.026); s.size1 = 0.006;
      ps.colors(_hot, 6, color, 2.2);
      s.alpha = 1; s.drag = 3.8; s.grav = 0.8; s.turb = 0; s.stretch = 0.05; s.fadeIn = 0; s.colorT = 0.3; s.fadeOut = 0.3; s.spin = 0;
      ps.emit();
    }
  };

  // ---------------------------------------------------------------- bolt hooks

  bolts.onSpawn = (s) => {
    if (s.arc) return -1;
    const k = Math.sqrt(Math.max(0.5, s.width / 0.06));
    _col.copy(s.color).lerp(_white, 0.25);
    const h = flare(FK_DISC, s.from, _col, 1.5, 0.32 * k, 0.4 * k, s.life, 0, 1);
    // fist discharge: crawling micro-arcs + a spit of sparks at the origin
    scheduleArcs(s.from, s.color, 2, 0.32 * k, 90);
    const ps = particles, sp = ps.spec;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(1.2, 3.2);
      sp.x = s.from.x; sp.y = s.from.y; sp.z = s.from.z;
      sp.vx = Math.cos(a) * v; sp.vy = Math.sin(a) * v; sp.vz = rand(0, 1.5);
      sp.kind = PK_SPARK; sp.life = rand(160, 320); sp.size0 = rand(0.014, 0.022); sp.size1 = 0.006;
      ps.colors(_col, 6, s.color, 2.4);
      sp.alpha = 1; sp.drag = 3; sp.grav = 4; sp.turb = 0; sp.stretch = 0.04; sp.fadeIn = 0; sp.colorT = 0.3; sp.fadeOut = 0.3; sp.spin = 0;
      ps.emit();
    }
    return h;
  };
  bolts.onTick = (h, inten) => flares.setExt(h, inten);
  bolts.onEnd = (h) => flares.kill(h);
  bolts.onImpact = (to, color, width) => {
    const kw = Math.max(0.5, Math.min(2.5, width / 0.06));
    const k = Math.sqrt(kw);
    heat += 1;
    const g = 1 / Math.sqrt(heat);
    _col2.copy(color);
    _hot.copy(_white).lerp(_col2, 0.15);
    flare(FK_DISC, to, _hot, 1.6 * g, 0.32 * k, 0.42 * k, 85, 2.4, 2);
    flare(FK_STREAK, to, _col2, 2.0 * g, 3.0 * k, 3.8 * k, 280, 1.8, 2, 1, 0.035 / k);
    flare(FK_STAR, to, _hot, 1.3 * g, 0.85 * k, 1.05 * k, 300, 1.6, 2, 1, 1, 1.2);
    flare(FK_GLOW, to, _col2, 0.12 * g, 1.3 * k, 1.7 * k, 620, 1.4, 2);
    sparkBurst(to, Math.round(40 * kw * (0.5 + 0.5 * g)), _col2, 0.85 + 0.25 * k);
    shock(to, _col2, 1.15 * k, g);
    scheduleArcs(to, _col2, 4, 0.75 * k, 260);
    flashLight(to, _col2, 1);
    ctx.shake(0.3 * Math.min(1.4, k));
  };

  // ---------------------------------------------------------------- API

  const fx: Fx = {
    object,

    bolt(from, to, opts) {
      const o = boltOpts;
      o.color.set(opts?.color ?? PALETTE.cyan);
      o.width = opts?.width ?? 0.06;
      o.duration = opts?.duration ?? 420;
      o.branches = opts?.branches ?? 3;
      o.arc = false;
      nudge(to, 0.32, _q);
      bolts.spawn(from, _q, o);
    },

    sparks(at, count, color) {
      _col.set(color ?? PALETTE.cyan);
      nudge(at, 0.3, _p);
      _hot.copy(_white).lerp(_col, 0.25);
      heat += 0.4;
      const g = 1 / Math.sqrt(Math.max(1, heat));
      flare(FK_DISC, _p, _hot, 1.9 * g, 0.42, 0.52, 110, 2.2, 2);
      flare(FK_STAR, _p, _hot, 1.7 * g, 0.55, 0.7, 220, 1.8, 2, 1, 1, 2);
      sparkBurst(_p, Math.max(1, Math.round(count)), _col, 1);
    },

    shockwave(at, color, radius) {
      _col.set(color ?? PALETTE.cyan);
      nudge(at, 0.3, _p);
      heat += 0.6;
      shock(_p, _col, radius ?? 1.6, 1 / Math.sqrt(Math.max(1, heat)));
    },

    coins(count, mode) {
      coins.spawn(Math.max(0, Math.round(count)), mode ?? 'rain');
    },

    aura(at, ms, color) {
      _col.set(color ?? PALETTE.cyan);
      nudge(at, 0.3, _p);
      auras.spawn(_p.x, _p.y, _p.z, Math.max(50, ms), _col);
    },

    update(dt, t) {
      shared.uTime.value = t;
      heat = Math.max(0, heat - dt / 150);
      ctx.renderer.getDrawingBufferSize(_v2);
      const cam = ctx.camera;
      shared.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, _v2.y) / (cam.zoom || 1);
      bolts.update(dt);
      auras.update(dt);
      // scheduled micro arcs (impact crawl)
      for (let i = 0; i < arcN; ) {
        const o = i * AQ;
        arcQ[o] -= dt;
        if (arcQ[o] > 0) {
          i++;
          continue;
        }
        const r = arcQ[o + 7];
        const a0 = Math.random() * Math.PI * 2;
        const a1 = a0 + rand(0.5, 1.4) * (Math.random() < 0.5 ? -1 : 1);
        _p.set(arcQ[o + 1] + Math.cos(a0) * r * rand(0.05, 0.3), arcQ[o + 2] + Math.sin(a0) * r * rand(0.05, 0.3), arcQ[o + 3]);
        const r1 = r * rand(0.6, 1);
        _q.set(arcQ[o + 1] + Math.cos(a1) * r1, arcQ[o + 2] + Math.sin(a1) * r1, arcQ[o + 3] + rand(-0.1, 0.15));
        arcOpts.color.setRGB(arcQ[o + 4], arcQ[o + 5], arcQ[o + 6]).lerp(_white, 0.2);
        arcOpts.width = rand(0.018, 0.03);
        arcOpts.duration = rand(100, 180);
        arcOpts.branches = Math.random() < 0.6 ? 1 : 2;
        bolts.spawn(_p, _q, arcOpts);
        // remove (swap with last)
        arcN--;
        if (i !== arcN) arcQ.copyWithin(o, arcN * AQ, arcN * AQ + AQ);
      }
      coins.update(dt);
      particles.update(dt);
      flares.update(dt);
      // local light flash with flicker
      if (lightV > 0) {
        lightV = Math.max(0, lightV - dt / 240);
        const fl = 0.75 + 0.25 * Math.sin(t * 0.09) * Math.sin(t * 0.031);
        light.intensity = lightPeak * lightV * lightV * fl;
      } else light.intensity = 0;
    },
  };
  return fx;
}
