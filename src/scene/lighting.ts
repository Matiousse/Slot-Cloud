// Shared cinematic light rig (used by the environment module and by stubs, so
// every module is authored under the same lighting).
//
//   key   : cool white-blue, top-left-front (shapes the forms)
//   rimL  : magenta, back-left   (silhouette edge)
//   rimR  : cyan, back-right     (silhouette edge)
//   fill  : hemisphere, storm blue / near black
//   bolt  : lightning point light (flash), above the scene

import * as THREE from 'three';
import type { SceneMode } from './contracts';

export interface LightRig {
  group: THREE.Group;
  key: THREE.DirectionalLight;
  rimL: THREE.SpotLight;
  rimR: THREE.SpotLight;
  fill: THREE.HemisphereLight;
  bolt: THREE.PointLight;
  flash(strength?: number): void;
  setMode(mode: SceneMode): void;
  update(dt: number): void;
}

const MODE_COLORS: Record<SceneMode, { key: number; rimL: number; rimR: number; sky: number; ground: number; bolt: number }> = {
  base: { key: 0xcfe0ff, rimL: 0xff2fa0, rimR: 0x38e8ff, sky: 0x1a2550, ground: 0x050608, bolt: 0xbfefff },
  overcharge: { key: 0xdff4ff, rimL: 0x5a7dff, rimR: 0x7ff6ff, sky: 0x1b3a7a, ground: 0x04060c, bolt: 0xe6fbff },
  lock: { key: 0xffd9c9, rimL: 0xff3b30, rimR: 0xffc93c, sky: 0x4a0a10, ground: 0x080303, bolt: 0xffd36b },
  god: { key: 0xf3e2ff, rimL: 0x9b4dff, rimR: 0xffd36b, sky: 0x2b0a4a, ground: 0x060309, bolt: 0xfff0c0 },
};

export function createLightRig(): LightRig {
  const group = new THREE.Group();
  group.name = 'lightRig';

  const key = new THREE.DirectionalLight(0xcfe0ff, 2.2);
  key.position.set(-6, 9, 10);
  group.add(key, key.target);

  const mkSpot = (color: number, x: number) => {
    const s = new THREE.SpotLight(color, 160, 40, Math.PI / 5, 0.6, 1.4);
    s.position.set(x, 9, -9);
    s.target.position.set(0, 2, 0);
    group.add(s, s.target);
    return s;
  };
  const rimL = mkSpot(0xff2fa0, -9);
  const rimR = mkSpot(0x38e8ff, 9);

  const fill = new THREE.HemisphereLight(0x1a2550, 0x050608, 0.9);
  group.add(fill);

  const bolt = new THREE.PointLight(0xbfefff, 0, 60, 1.2);
  bolt.position.set(0, 14, 4);
  group.add(bolt);

  let flashV = 0;
  const target = { ...MODE_COLORS.base };
  const tmp = new THREE.Color();

  return {
    group,
    key,
    rimL,
    rimR,
    fill,
    bolt,
    flash(strength = 1) {
      flashV = Math.max(flashV, strength);
      bolt.position.x = (Math.random() - 0.5) * 16;
    },
    setMode(mode) {
      Object.assign(target, MODE_COLORS[mode]);
    },
    update(dt) {
      const k = Math.min(1, dt / 500);
      key.color.lerp(tmp.set(target.key), k);
      rimL.color.lerp(tmp.set(target.rimL), k);
      rimR.color.lerp(tmp.set(target.rimR), k);
      fill.color.lerp(tmp.set(target.sky), k);
      fill.groundColor.lerp(tmp.set(target.ground), k);
      bolt.color.lerp(tmp.set(target.bolt), k);
      flashV = Math.max(0, flashV - dt / 260);
      // flicker while flashing
      const flick = flashV > 0.05 ? (Math.random() > 0.3 ? 1 : 0.35) : 1;
      bolt.intensity = flashV * 900 * flick;
    },
  };
}
