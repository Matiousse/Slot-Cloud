// RAIJIN OVERLOAD — premium 3D reel symbols.
//
// createSymbolKit(ctx) builds every symbol model once (shared geometry +
// materials), bakes a motion-blurred billboard per symbol for the spin state,
// and hands out lightweight views:
//
//   view.object            Group positioned by the board (cell centre, faces +z)
//   view.setState(s)       idle | spin | land | win | dim | trigger
//   view.update(dt, t)     every frame (clock-scaled ms); drives shaders + motion
//
// Per-view material clones are only swapped in while a view is dimmed / glowing,
// so idle views share everything.

import * as THREE from 'three';
import { SYMBOLS, type SymbolCode } from '../../../shared/game';
import type { SceneContext, SymbolKit, SymbolState, SymbolView } from '../contracts';
import { Assets } from './assets';
import { Baker } from './bake';
import { spriteMaterial } from './shaders';
import type { SymbolDef, ViewAnim } from './types';
import { DEFS } from './defs';

/** World size of the baked spin sprite (width) and its vertical stretch. */
const SPRITE_SIZE = 1.2;
const SPRITE_STRETCH = 1.5;

interface Shared {
  a: Assets;
  protos: Map<SymbolCode, THREE.Object3D>;
  sprites: Map<SymbolCode, THREE.ShaderMaterial>;
  geo: {
    back: THREE.PlaneGeometry;
    flare: THREE.PlaneGeometry;
    glint: THREE.PlaneGeometry;
    sprite: THREE.PlaneGeometry;
  };
  glintMat: THREE.MeshBasicMaterial;
  backMats: Map<SymbolCode, THREE.MeshBasicMaterial>;
  raysMats: Map<SymbolCode, THREE.MeshBasicMaterial>;
  ringMat: THREE.MeshBasicMaterial;
}

interface Slot {
  mesh: THREE.Mesh;
  base: THREE.Material | THREE.Material[];
  alt: THREE.Material | THREE.Material[] | null;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);
const outBack = (t: number) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

class View implements SymbolView {
  readonly object = new THREE.Group();
  private body = new THREE.Group();
  private model: THREE.Object3D;
  private back: THREE.Mesh;
  private blur: THREE.Mesh;
  private glint: THREE.Mesh;
  private rays: THREE.Mesh | null = null;
  private ring: THREE.Mesh | null = null;
  private slots: Slot[] = [];
  private cloned = false;
  private lastDim = 1;
  private lastBoost = 1;
  private anim: ViewAnim;
  private def: SymbolDef;
  // state
  private state: SymbolState = 'idle';
  private stateT = 0;
  private dim = 1;
  private dimTarget = 1;
  private boost = 1;
  private boostTarget = 1;
  private dimAmt = 0;
  private flare = 0; // rays visibility 0..1
  private ringT = -1; // ms since ring burst (-1 = off)
  private glintT = -1;
  private glintWait: number;
  private glintIdx = 0;
  private phase = Math.random() * TAU;

  constructor(
    readonly code: SymbolCode,
    private s: Shared,
    def: SymbolDef,
  ) {
    this.def = def;
    this.object.name = `symbol-${code}`;
    this.model = s.protos.get(code)!.clone(true);
    this.body.add(this.model);
    this.object.add(this.body);

    this.back = new THREE.Mesh(s.geo.back, s.backMats.get(code)!);
    this.back.position.z = -0.2;
    this.back.renderOrder = -2;
    this.object.add(this.back);

    this.glint = new THREE.Mesh(s.geo.glint, s.glintMat);
    this.glint.visible = false;
    this.glint.renderOrder = 5;
    this.body.add(this.glint);

    this.blur = new THREE.Mesh(s.geo.sprite, s.sprites.get(code)!);
    this.blur.visible = false;
    this.blur.renderOrder = 2;
    this.object.add(this.blur);

    const nodes = new Map<string, THREE.Object3D>();
    this.model.traverse((o) => {
      if (o.name) nodes.set(o.name, o);
      const m = o as THREE.Mesh;
      if (m.isMesh) this.slots.push({ mesh: m, base: m.material, alt: null });
    });
    this.slots.push({ mesh: this.back, base: this.back.material, alt: null });
    this.anim = { nodes, state: 'idle', stateT: 0, boost: 1, dim: 1, phase: this.phase };
    this.glintWait = 800 + Math.random() * 4000;
  }

  setState(state: SymbolState): void {
    const prev = this.state;
    this.state = state;
    this.stateT = 0;
    const spinning = state === 'spin';
    this.model.visible = !spinning;
    this.back.visible = !spinning;
    this.blur.visible = spinning;
    if (spinning) {
      this.glint.visible = false;
      this.glintT = -1;
      this.dim = this.dimTarget = 1;
      this.boost = this.boostTarget = 1;
      this.dimAmt = 0;
      this.flare = 0;
      this.ringT = -1;
      if (this.rays) this.rays.visible = false;
      if (this.ring) this.ring.visible = false;
    }
    this.dimTarget = state === 'dim' ? 0.3 : 1;
    this.boostTarget = state === 'win' ? 1.9 : state === 'trigger' ? 1.7 : 1;
    if (state === 'win' || state === 'trigger') {
      this.ensureFlares();
      this.ringT = 0;
      this.glintT = -1;
      this.glintWait = 520;
    }
    if (state === 'land' && prev !== 'spin') this.stateT = 0;
  }

  private ensureFlares() {
    if (this.rays) return;
    const a = this.s.a;
    this.rays = new THREE.Mesh(this.s.geo.flare, a.clone(this.s.raysMats.get(this.code)!));
    this.rays.position.z = -0.19;
    this.rays.renderOrder = -1;
    this.rays.visible = false;
    this.ring = new THREE.Mesh(this.s.geo.flare, a.clone(this.s.ringMat));
    this.ring.position.z = -0.18;
    this.ring.renderOrder = -1;
    this.ring.visible = false;
    this.object.add(this.rays, this.ring);
  }

  update(dt: number, t: number): void {
    const a = this.s.a;
    a.time.value = t * 0.001;
    a.lastUpdate = t;
    this.stateT += dt;
    const st = this.state;
    const T = this.stateT;
    const k = 1 - Math.exp(-dt / 110);

    if (st === 'land' && T > 460) {
      this.state = 'idle';
    }
    if (st === 'spin') {
      // tiny shimmer of the blur billboard
      this.blur.scale.set(1, 1 + 0.04 * Math.sin(t * 0.05 + this.phase), 1);
      return;
    }

    // ---- smoothed modulation
    this.dim += (this.dimTarget - this.dim) * k;
    let bt = this.boostTarget;
    if (st === 'win') bt = 1.75 + 0.3 * Math.sin(T * 0.009);
    if (st === 'trigger') {
      const beat = (T % 720) / 720;
      bt = 1.3 + 1.7 * Math.exp(-beat * 7);
    }
    this.boost += (bt - this.boost) * (st === 'trigger' ? 1 - Math.exp(-dt / 40) : k);
    if (Math.abs(this.dim - this.dimTarget) < 0.004) this.dim = this.dimTarget;
    if (Math.abs(this.boost - bt) < 0.004) this.boost = bt;
    this.dimAmt += ((this.dimTarget < 1 ? 1 : 0) - this.dimAmt) * k;

    // ---- transforms
    const def = this.def;
    const ph = this.phase;
    const sway = (def.sway ?? 0.14) * (1 - this.dimAmt * 0.7);
    let ry = Math.sin(t * 0.00105 + ph) * sway;
    let rx = Math.sin(t * 0.00083 + ph * 1.7) * sway * 0.3;
    let rz = 0;
    let y = Math.sin(t * 0.0016 + ph) * (def.bob ?? 0.012);
    let z = -0.06 * this.dimAmt;
    let sx = 1 - 0.07 * this.dimAmt, sy = sx, sz = sx;

    if (st === 'land') {
      const s = clamp01(T / 460);
      const f = Math.exp(-5.2 * s) * Math.cos(s * TAU * 1.35);
      sy *= 1 - 0.2 * f;
      sx *= 1 + 0.12 * f;
      sz *= 1 + 0.12 * f;
      y -= 0.05 * f;
      ry *= s;
      rx *= s;
    } else if (st === 'win') {
      // anticipation squash -> pop (outBack) -> 360 spin -> breathing hold
      const pre = clamp01(T / 120);
      const pop = clamp01((T - 120) / 420);
      const spin = clamp01((T - 100) / 760);
      const hold = 1.12 + 0.03 * Math.sin(T * 0.0085);
      let sc: number;
      if (T < 120) sc = 1 - 0.1 * smooth(pre);
      else if (T < 540) sc = 0.9 + (1.3 - 0.9) * outBack(pop);
      else sc = 1.3 + (hold - 1.3) * smooth(clamp01((T - 540) / 380));
      sx *= sc;
      sy *= sc;
      sz *= sc;
      ry = ry * smooth(clamp01((T - 860) / 400)) + TAU * smooth(spin);
      y += 0.03 * Math.sin(Math.PI * clamp01((T - 120) / 700));
      z += 0.08;
    } else if (st === 'trigger') {
      const beat = (T % 720) / 720;
      const pulse = Math.exp(-beat * 6) * Math.sin(Math.min(1, beat * 9) * Math.PI * 0.5);
      const intro = smooth(clamp01(T / 300));
      const sc = 1 + 0.06 * intro + 0.16 * pulse;
      sx *= sc;
      sy *= sc;
      sz *= sc;
      rz = Math.sin(T * 0.031) * 0.05 * pulse;
      z += 0.08 * intro;
      if (T % 720 < dt && T > dt) this.ringT = 0;
    }
    this.body.position.set(0, y, z);
    this.body.rotation.set(rx, ry, rz);
    this.body.scale.set(sx, sy, sz);

    // ---- back glow follows dim/boost via material modulation; slight breathing scale
    const bg = 1 + 0.04 * Math.sin(t * 0.0021 + ph) + (this.boost - 1) * 0.18;
    this.back.scale.set(bg, bg, 1);

    // ---- flares (rays + ring) for win / trigger
    const flareTarget = st === 'win' || st === 'trigger' ? 1 : 0;
    this.flare += (flareTarget - this.flare) * (1 - Math.exp(-dt / 160));
    if (this.rays && this.ring) {
      const on = this.flare > 0.01;
      this.rays.visible = on;
      if (on) {
        const rm = this.rays.material as THREE.Material;
        const rs = 0.95 + 0.12 * Math.sin(t * 0.004 + ph);
        this.rays.scale.set(rs, rs, 1);
        this.rays.rotation.z = t * 0.00045 + ph;
        a.modulate(rm, 1, this.flare * (0.8 + 0.25 * Math.sin(t * 0.006)));
      }
      if (this.ringT >= 0) {
        this.ringT += dt;
        const p = clamp01(this.ringT / 560);
        const rs = 0.45 + 1.35 * (1 - Math.pow(1 - p, 3));
        this.ring.visible = p < 1;
        this.ring.scale.set(rs, rs, 1);
        a.modulate(this.ring.material as THREE.Material, 1, (1 - p) * (1 - p) * 1.6);
        if (p >= 1) this.ringT = -1;
      } else this.ring.visible = false;
    }

    // ---- star glints
    this.updateGlint(dt);

    // ---- per-symbol extras
    const an = this.anim;
    an.state = st === 'land' && T > 460 ? 'idle' : this.state;
    an.stateT = T;
    an.boost = this.boost;
    an.dim = this.dim;
    def.tick?.(an, dt, t);

    // ---- materials
    this.applyMods();
  }

  private updateGlint(dt: number) {
    const anchors = this.def.glints;
    if (this.glintT < 0) {
      if (this.dimTarget < 1 || anchors.length === 0) return;
      this.glintWait -= dt;
      if (this.glintWait > 0) return;
      this.glintT = 0;
      this.glintIdx = (this.glintIdx + 1 + Math.floor(Math.random() * 2)) % anchors.length;
      const p = anchors[this.glintIdx];
      this.glint.position.set(p[0], p[1], p[2] + 0.06);
      this.glint.visible = true;
    }
    this.glintT += dt;
    const dur = 560;
    const p = clamp01(this.glintT / dur);
    const s = Math.sin(p * Math.PI);
    const sc = 0.02 + s * s * (this.state === 'win' ? 0.55 : 0.4);
    this.glint.scale.set(sc, sc, 1);
    this.glint.rotation.z = p * 1.4;
    if (p >= 1) {
      this.glintT = -1;
      this.glint.visible = false;
      this.glintWait = this.state === 'win' || this.state === 'trigger' ? 260 + Math.random() * 500 : 2200 + Math.random() * 4200;
    }
  }

  private applyMods() {
    const d = this.dim, b = this.boost;
    const neutral = Math.abs(d - 1) < 0.003 && Math.abs(b - 1) < 0.003;
    if (neutral) {
      if (this.cloned) {
        for (const sl of this.slots) sl.mesh.material = sl.base;
        this.cloned = false;
      }
      this.lastDim = 1;
      this.lastBoost = 1;
      return;
    }
    const a = this.s.a;
    if (!this.cloned) {
      for (const sl of this.slots) {
        if (!sl.alt) sl.alt = Array.isArray(sl.base) ? sl.base.map((m) => a.clone(m)) : a.clone(sl.base);
        sl.mesh.material = sl.alt;
      }
      this.cloned = true;
      this.lastDim = -1;
    }
    if (Math.abs(d - this.lastDim) < 0.002 && Math.abs(b - this.lastBoost) < 0.002) return;
    this.lastDim = d;
    this.lastBoost = b;
    for (const sl of this.slots) {
      const alt = sl.alt!;
      if (Array.isArray(alt)) for (let i = 0; i < alt.length; i++) a.modulate(alt[i], d, b);
      else a.modulate(alt, d, b);
    }
  }
}

export function createSymbolKit(ctx: SceneContext): SymbolKit {
  const a = new Assets(ctx.renderer);
  const protos = new Map<SymbolCode, THREE.Object3D>();
  for (const code of SYMBOLS) {
    const p = DEFS[code].build(a);
    p.name = p.name || `proto-${code}`;
    protos.set(code, p);
  }

  const geo = {
    back: a.own(new THREE.PlaneGeometry(1.3, 1.3)),
    flare: a.own(new THREE.PlaneGeometry(1.5, 1.5)),
    glint: a.own(new THREE.PlaneGeometry(1, 1)),
    sprite: a.own(new THREE.PlaneGeometry(SPRITE_SIZE, SPRITE_SIZE * SPRITE_STRETCH)),
  };
  const backMats = new Map<SymbolCode, THREE.MeshBasicMaterial>();
  const raysMats = new Map<SymbolCode, THREE.MeshBasicMaterial>();
  for (const code of SYMBOLS) {
    const d = DEFS[code];
    backMats.set(code, a.additive('back', a.softGlow(), d.color, d.backGlow));
    raysMats.set(code, a.additive('rays', a.rays(), d.color, 0.55));
  }

  // bake motion-blur billboards (also warms up every shader program)
  const sprites = new Map<SymbolCode, THREE.ShaderMaterial>();
  const baker = new Baker(ctx.renderer);
  for (const code of SYMBOLS) {
    const rt = a.own(baker.spinSprite(protos.get(code)!, { size: SPRITE_SIZE, px: 128 }, SPRITE_STRETCH, 0.26));
    sprites.set(code, spriteMaterial(a, code, rt.texture));
  }
  baker.dispose();

  const shared: Shared = {
    a,
    protos,
    sprites,
    geo,
    glintMat: a.additive('glint', a.star(), 0xfff6e0, 3.2),
    backMats,
    raysMats,
    ringMat: a.additive('ring', a.ring(), 0xffffff, 1.6),
  };

  return {
    create(code: SymbolCode): SymbolView {
      return new View(code, shared, DEFS[code]);
    },
    setClipping(planes: THREE.Plane[]) {
      a.setClipping(planes);
    },
    dispose() {
      a.dispose();
    },
  };
}

export { renderSymbolIcons } from './icons';
