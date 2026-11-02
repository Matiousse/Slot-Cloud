// Placeholder implementations of every scene module, used by the dev harness
// while the real modules are being built (and as a reference of the contracts).

import * as THREE from 'three';
import { SYMBOLS, REELS, ROWS, type LineWin, type SymbolCode } from '../../shared/game';
import type { Board3D, Cabinet, Character, Environment, Fx, SceneContext, SymbolKit, SymbolView } from './contracts';
import { createLightRig } from './lighting';
import { MAT, glow } from './materials';
import { textGeometry } from './text3d';

export function createEnvironmentStub(ctx: SceneContext): Environment {
  const rig = createLightRig();
  ctx.scene.background = new THREE.Color(0x070a18);
  ctx.scene.fog = new THREE.FogExp2(0x070a18, 0.012);
  const object = new THREE.Group();
  object.add(rig.group);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x080a12, roughness: 0.2, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.2;
  object.add(floor);
  return {
    object,
    onThunder: () => {},
    flash: (s) => rig.flash(s),
    setMode: (m) => rig.setMode(m),
    setLayout: () => {},
    update: (dt) => rig.update(dt),
  };
}

export function createCharacterStub(): Character {
  const object = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 2.6, 6, 16), MAT.gunmetal());
  body.position.set(0, 4.2, -2.6);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.1), MAT.neon());
  eye.position.set(0, 5.4, -1.3);
  object.add(body, eye);
  return {
    object,
    setLayout: () => {},
    getFistWorld: (side, out) => out.set(side === 'left' ? -2.9 : 2.9, 2.8, 0.4),
    anticipate: () => {},
    strike: async () => 'right',
    react: () => {},
    setMode: () => {},
    intro: async () => {},
    update: () => {},
  };
}

const STUB_COLORS: Record<string, number> = {
  L5: 0x2de2c0, L4: 0x3aa0ff, L3: 0xa66bff, L2: 0xff4fc8, L1: 0xff9a1f,
  H4: 0x38e8ff, H3: 0x9ff6ff, H2: 0x8a4dff, H1: 0xffc93c, WD: 0xffd84a, SW: 0xe6fbff, SC: 0xb3121f,
};
const STUB_TEXT: Record<string, string> = { L5: '10', L4: 'J', L3: 'Q', L2: 'K', L1: 'A', H4: 'H4', H3: 'H3', H2: 'H2', H1: 'H1', WD: 'W', SW: 'S', SC: 'B' };

export function createSymbolKitStub(): SymbolKit {
  let planes: THREE.Plane[] = [];
  const mats: THREE.Material[] = [];
  return {
    create(code: SymbolCode): SymbolView {
      const m = new THREE.MeshStandardMaterial({ color: STUB_COLORS[code], metalness: 0.6, roughness: 0.3, emissive: glow(STUB_COLORS[code], 0.25) });
      m.clippingPlanes = planes;
      mats.push(m);
      const object = new THREE.Mesh(textGeometry(STUB_TEXT[code], { size: 0.5, depth: 0.15 }), m);
      return { code, object, setState: () => {}, update: () => {} };
    },
    setClipping(p) {
      planes = p;
      mats.forEach((m) => (m.clippingPlanes = p));
    },
    dispose() {},
  };
}

export function createFxStub(ctx: SceneContext): Fx {
  const object = new THREE.Group();
  const lines: { obj: THREE.Line; life: number }[] = [];
  return {
    object,
    bolt(from, to) {
      const g = new THREE.BufferGeometry().setFromPoints([from, to]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: glow(0xe6fbff, 5) }));
      object.add(l);
      lines.push({ obj: l, life: 400 });
      ctx.shake(0.4);
    },
    sparks() {},
    shockwave() {},
    coins() {},
    aura() {},
    update(dt) {
      for (const l of lines) l.life -= dt;
      for (const l of lines.filter((x) => x.life <= 0)) object.remove(l.obj);
      lines.splice(0, lines.length, ...lines.filter((x) => x.life > 0));
    },
  };
}

export function createCabinetStub(): Cabinet {
  const object = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.9, 5.9, 0.3), MAT.blackSteel());
  frame.position.z = -0.4;
  const top = new THREE.Mesh(textGeometry('RAIJIN', { size: 0.55, depth: 0.15 }), [MAT.gold(), MAT.goldDeep()]);
  top.position.set(0, 3.4, 0.2);
  object.add(frame, top);
  return { object, pulse: () => {}, anticipation: () => {}, setMode: () => {}, showLogo: (on) => (top.visible = on), update: () => {} };
}

/** Static board (no spinning) — enough to preview other modules in context. */
export function createBoardStub(_ctx: SceneContext, kit: SymbolKit): Board3D {
  const object = new THREE.Group();
  const grid: SymbolCode[][] = [];
  for (let r = 0; r < REELS; r++) {
    grid.push([]);
    for (let y = 0; y < ROWS; y++) {
      const code = SYMBOLS[(r * 3 + y * 5) % 9] as SymbolCode;
      grid[r].push(code);
      const v = kit.create(code);
      v.object.position.set(r - 2, 2 - y, 0);
      object.add(v.object);
    }
  }
  return {
    object,
    reels: Array.from({ length: REELS }, () => ({ locked: false })),
    storms: new Map(),
    spinning: false,
    useFreeSpinReels: () => {},
    setBoard: () => {},
    symbolAt: (r, y) => grid[r][y],
    lockReel: () => {},
    startSpin: () => {},
    stopReels: async () => {},
    slam: () => {},
    expandStorm: async () => {},
    setStorm: () => {},
    clearStorms: () => {},
    showWins: (_w: LineWin[]) => {},
    clearWins: () => {},
    glowScatters: () => {},
    scatterLanded: () => {},
    cellWorld: (r, y, out) => out.set(r - 2, 2 - y, 0),
    update: () => {},
  };
}
