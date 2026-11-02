// ENVIRONMENT — rain-soaked neo-Edo night under a permanent thunderstorm.
// See docs/ART_DIRECTION.md §1-3. Everything procedural (shaders, canvas).
//
// Depth layout (camera looks down -z from z≈15 landscape / z≈23 portrait):
//   z  +8 ..  -16  shrine rooftop: wet stone floor, rain, splashes, tōrō, torii, parapet
//   z -23 ..  -30  neighbouring towers with neon signage (frame the right / left strips)
//   z -30 ..  -85  abyss towers far below + hero pagoda, fog cards
//   z -85 .. -170  skyline (window shader), landmark towers, holo billboards, searchlights
//   z -175..  -255 distant bolts, storm sky dome
// The zone right behind the cabinet / character is kept darker (calm mask).

import * as THREE from 'three';
import type { Environment, LayoutKind, SceneContext, SceneMode } from '../contracts';
import { createLightRig } from '../lighting';
import { radialTexture } from '../materials';
import { makeUniforms, PaletteDriver } from './palette';
import { bakeStatic } from './util';
import { createSkyDome, SkyBolts } from './sky';
import { createCity } from './city';
import { SignSystem, type Sign, type SignSpec } from './signs';
import { createTorii, pagodaGeometry, structureMaterial } from './structures';
import { createRooftop, FLOOR_Y, type ReflectionSource } from './rooftop';
import { FogLayers } from './fog';
import { Rain, createSplashes } from './rain';
import { Beams, createMotes } from './beams';

/** Angular windows (x/dz, y/dz) where distant bolts are actually visible per layout. */
const BOLT_WINDOWS: Record<LayoutKind, [number, number, number, number][]> = {
  // [aMin, aMax, bTop, bBottom]
  landscape: [
    [0.26, 0.36, 0.3, 0.02],
    [0.25, 0.39, 0.3, 0.05],
    [0.28, 0.34, 0.3, 0.0],
    [-0.62, -0.5, 0.3, 0.08],
  ],
  portrait: [
    [-0.13, -0.05, 0.3, 0.14],
    [0.05, 0.13, 0.3, 0.14],
  ],
};

/** Calm (darker) zone behind the character per layout: angular centre + radii. */
const CALM: Record<LayoutKind, [number, number, number, number]> = {
  landscape: [-0.38, 0.02, 0.21, 0.36],
  portrait: [0.0, 0.21, 0.085, 0.075],
};

const NEAR_SIGNS: SignSpec[] = [
  // right strip: two towers flanking the hero pagoda (front faces z = -24 / -23.5)
  { text: '雷神', font: 'kanji', vertical: true, style: 'tube', color: 0xff2fa0, color2: 0xff8fc0, w: 1.4, h: 3.2, pos: [9.1, -1.25, -23.8], intensity: 2.0, flicker: 0.25 },
  { text: '天', font: 'kanji', style: 'box', color: 0xffc93c, color2: 0xff7a1a, w: 1.0, h: 1.0, pos: [9.1, -3.55, -23.8], intensity: 1.3, flicker: 0.15 },
  { text: 'カミナリ', font: 'kanji', vertical: true, style: 'tube', color: 0x38e8ff, color2: 0x9ff6ff, w: 1.05, h: 3.9, pos: [14.15, -1.65, -23.3], intensity: 1.8, flicker: 0.6 },
  // far left (only visible on ultra-wide screens), dim
  { text: '電力', font: 'kanji', vertical: true, style: 'box', color: 0x38e8ff, color2: 0x1a6aff, w: 1.15, h: 2.6, pos: [-26, 1.6, -25.8], intensity: 1.0, flicker: 0.4 },
];

const FAR_SIGNS: SignSpec[] = [
  // far right skyline (wide screens)
  { text: 'ライジン', font: 'kanji', style: 'holo', color: 0x38e8ff, color2: 0x1a4cff, w: 12, h: 3.4, pos: [52, 12, -120], intensity: 1.0, backing: false, wallGlow: false, ppu: 24 },
];

/** Per-layout placement of elements that must be seen in both framings. */
const PLACES: Record<LayoutKind, { pagodaB: [number, number, number, number] }> = {
  landscape: { pagodaB: [-78, -6, -130, 1.2] },
  portrait: { pagodaB: [-9.6, 6.2, -86, 1.0] },
};

export function createEnvironment(ctx: SceneContext): Environment {
  const object = new THREE.Group();
  object.name = 'environment';
  const u = makeUniforms();
  const palette = new PaletteDriver(u);
  const viewH = { value: 720 };

  // ---- lights
  const rig = createLightRig();
  object.add(rig.group);

  // ---- background + fog (fog colour follows the palette)
  const bg = new THREE.Color(0x04050c);
  ctx.scene.background = bg;
  const fog = new THREE.FogExp2(0x0d1430, 0.0105);
  ctx.scene.fog = fog;

  // ---- sky
  const sky = createSkyDome(u);
  object.add(sky);
  const bolts = new SkyBolts(u, 3);
  object.add(bolts.group);

  // ---- city
  const city = createCity(u, viewH);
  object.add(city.group);

  // ---- landmark structures
  const structMat = structureMaterial(u);
  const pagA = pagodaGeometry({ tiers: 5, base: 7, tierH: 2.6 });
  const pagodaA = new THREE.Mesh(pagA.geo, structMat);
  pagodaA.position.set(19.4, -12.8, -48);
  pagodaA.scale.setScalar(1.15);
  pagodaA.rotation.y = -0.1;
  pagodaA.name = 'pagodaA';
  object.add(pagodaA);
  const pagB = pagodaGeometry({ tiers: 3, base: 6, tierH: 2.8, shrink: 0.82 });
  const pagodaB = new THREE.Mesh(pagB.geo, structMat);
  pagodaB.rotation.y = 0.2;
  pagodaB.name = 'pagodaB';
  object.add(pagodaB);
  // light-pollution glow behind the hero pagoda so its silhouette separates
  const backGlowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  backGlowMat.name = 'env-pagodaBackGlow';
  const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(46, 40), backGlowMat);
  backGlow.position.set(20, 4, -66);
  backGlow.renderOrder = -6;
  object.add(backGlow);
  const backGlowB = new THREE.Mesh(new THREE.PlaneGeometry(40, 36), backGlowMat);
  backGlowB.position.set(-9.5, 22, -100);
  backGlowB.renderOrder = -6;
  object.add(backGlowB);
  const torii = createTorii(7, 12);
  torii.group.position.set(8.3, FLOOR_Y, -8);
  torii.group.rotation.y = -0.06;
  object.add(bakeStatic(torii.group));

  // ---- signage
  const signs = new SignSystem(u);
  const near: Sign[] = NEAR_SIGNS.map((s) => signs.add(s));
  FAR_SIGNS.forEach((s) => signs.add(s));
  signs.finalize();
  object.add(signs.group);

  // ---- rooftop + reflections
  const roof = createRooftop(u);
  object.add(roof.group);
  const signSources: ReflectionSource[] = near.map((s) => ({
    // pretend the light hangs low so its streak lands on the visible wet floor
    pos: new THREE.Vector3(s.spec.pos[0], -3.1, s.spec.pos[2]),
    width: s.spec.w * 0.45,
    color: new THREE.Color(s.spec.color),
    intensity: 0,
    length: 0.1,
  }));
  roof.sources.push(...signSources);
  const toriiNeonSrc: ReflectionSource = {
    pos: new THREE.Vector3(5.2, -0.5, -8),
    width: 0.9,
    color: new THREE.Color(0xff2f6a),
    intensity: 0.55,
    length: 0.08,
  };
  roof.sources.push(toriiNeonSrc);
  roof.sources.push({ pos: new THREE.Vector3(0, -2.6, 0.6), width: 2.8, color: new THREE.Color(0x38e8ff), intensity: 0.3, length: 0.05 });

  // ---- atmosphere
  const fogCards = new FogLayers(u, [
    { z: -31, top: -7, soft: 9, opacity: 0.55, scale: 0.035, speed: 0.012, width: 140 },
    { z: -52, top: -3, soft: 13, opacity: 0.6, scale: 0.025, speed: 0.009, width: 180 },
    // glow bank right behind the hero pagoda (silhouette separation)
    { z: -49, top: 5, soft: 9, opacity: 0.42, scale: 0.05, speed: 0.012, width: 60 },
    { z: -80, top: 1, soft: 16, opacity: 0.55, scale: 0.02, speed: 0.007, width: 230 },
    { z: -108, top: 5, soft: 20, opacity: 0.5, scale: 0.016, speed: 0.006, width: 280 },
    { z: -142, top: 9, soft: 24, opacity: 0.5, scale: 0.013, speed: 0.005, width: 340 },
    { z: -178, top: 14, soft: 28, opacity: 0.6, scale: 0.011, speed: 0.004, width: 420 },
    // rooftop mist banks
    { z: -12.5, top: -2.4, soft: 2.0, opacity: 0.32, scale: 0.09, speed: 0.02, width: 70, bottom: -4.2 },
    { z: -3.5, top: -3.0, soft: 1.3, opacity: 0.26, scale: 0.12, speed: 0.026, width: 50, bottom: -4.2 },
  ]);
  object.add(fogCards.group);

  const rain = new Rain(u, [
    { count: 2600, min: [-55, -26, -62], size: [110, 62, 46], speed: 11, len: 1.5, width: 0.05, alpha: 0.32, color: 0x8aa6d6 },
    { count: 1100, min: [-18, -9, -15], size: [36, 24, 15], speed: 12.5, len: 0.8, width: 0.02, alpha: 0.3, color: 0x9fb8e0 },
    { count: 140, min: [-9, -7, 1.5], size: [18, 15, 7], speed: 14, len: 0.55, width: 0.012, alpha: 0.14, color: 0xb8cdf0 },
  ]);
  object.add(rain.group);
  const splashes = createSplashes(u, FLOOR_Y);
  object.add(splashes);

  const beams = new Beams(u);
  object.add(beams.group);
  const motes = createMotes(u, viewH);
  object.add(motes);

  // ---------------------------------------------------------------- lightning
  let layout: LayoutKind = 'landscape';
  let nextStrike = 2200;
  let nextFlicker = 700;
  let skyFlash = 0;
  // pooled multi-stroke pulses (no allocation per strike)
  const pulses = Array.from({ length: 12 }, () => ({ at: 0, s: 0, cell: 0, on: false }));
  const pulse = (at: number, s: number, cell: number) => {
    for (const p of pulses)
      if (!p.on) {
        p.at = at;
        p.s = s;
        p.cell = cell;
        p.on = true;
        return;
      }
  };
  let cellI = 0;
  let cell2I = 0;
  const camPos = new THREE.Vector3();
  const randIn = (a: number, b: number) => a + Math.random() * (b - a);
  const pickWindow = () => {
    const wins = BOLT_WINDOWS[layout];
    return wins[Math.floor(Math.random() * wins.length)];
  };

  const strike = (strength: number, withBolt: boolean) => {
    const w = pickWindow();
    const a = randIn(w[0], w[1]);
    const bTop = w[2];
    u.uCell.value.set(a, bTop - 0.04);
    const n = 2 + Math.floor(Math.random() * 3);
    let t = 0;
    for (let i = 0; i < n; i++) {
      pulse(t, strength * (i === 0 ? 1 : 0.4 + Math.random() * 0.5), 1);
      t += 55 + Math.random() * 120;
    }
    if (withBolt) {
      const z = -190 + Math.random() * 20;
      const dz = camPos.z - z;
      bolts.spawn(a * dz, bTop * dz, w[3] * dz - 12, z, 1 + strength * 0.7);
    }
    rig.flash(strength * 0.35);
  };

  const place = (kind: LayoutKind) => {
    const p = PLACES[kind].pagodaB;
    pagodaB.position.set(p[0], p[1], p[2]);
    pagodaB.scale.setScalar(p[3]);
    backGlowB.visible = kind === 'portrait';
  };

  const env: Environment = {
    object,
    onThunder: () => {},
    flash(strength = 1) {
      skyFlash = Math.max(skyFlash, 1.0 * strength);
      rig.flash(strength);
      u.uCell2.value.set((Math.random() - 0.5) * 0.3, 0.24);
      cell2I = Math.max(cell2I, 1.6 * strength);
      pulse(80 + Math.random() * 40, 0.65 * strength, 0);
      // big game strikes also crack a distant bolt across the visible sky
      if (strength >= 0.8 && Math.random() < 0.5) {
        const w = pickWindow();
        const a = randIn(w[0], w[1]);
        const z = -190 + Math.random() * 20;
        const dz = camPos.z - z;
        bolts.spawn(a * dz, w[2] * dz, w[3] * dz - 12, z, 1.4);
      }
    },
    setMode(mode: SceneMode, instant = false) {
      palette.set(mode, instant);
      rig.setMode(mode);
      if (instant) rig.update(1e6);
      if (!instant && mode !== 'base') nextStrike = Math.min(nextStrike, 300);
    },
    setLayout(kind: LayoutKind) {
      layout = kind;
      const c = CALM[kind];
      u.uCalm.value.set(c[0], c[1], c[2], c[3]);
      place(kind);
    },
    update(dt: number) {
      const sec = dt / 1000;
      u.uTime.value += sec;
      u.uCloudT.value += sec * u.uChurn.value;
      ctx.camera.getWorldPosition(camPos);
      viewH.value = ctx.renderer.domElement.height || 720;
      palette.step(dt);
      rig.update(dt);

      // ambient lightning
      const def = palette.def;
      nextStrike -= dt;
      if (nextStrike <= 0) {
        const s = 0.45 + Math.random() * 0.5;
        strike(s, Math.random() < 0.8);
        env.onThunder(s);
        nextStrike = randIn(def.strikeMin, def.strikeMax);
      }
      nextFlicker -= dt;
      if (nextFlicker <= 0) {
        const w = pickWindow();
        u.uCell2.value.set(randIn(w[0] - 0.12, w[1] + 0.12), randIn(0.1, 0.3));
        cell2I = Math.max(cell2I, 0.5 + Math.random() * 0.9);
        nextFlicker = randIn(def.flickerMin, def.flickerMax);
      }
      for (const p of pulses) {
        if (!p.on) continue;
        p.at -= dt;
        if (p.at <= 0) {
          skyFlash = Math.max(skyFlash, p.s);
          if (p.cell) cellI = Math.max(cellI, 0.9 + p.s * 1.3);
          p.on = false;
        }
      }
      skyFlash = Math.max(0, skyFlash - dt / 170);
      cellI = Math.max(0, cellI - dt / 210);
      cell2I = Math.max(0, cell2I - dt / 280);
      const flick = skyFlash > 0.05 ? 0.72 + Math.random() * 0.28 : 1;
      u.uFlash.value = skyFlash * flick;
      u.uCellI.value = cellI * flick;
      u.uCell2I.value = cell2I;

      bolts.update(dt);
      signs.update(dt);
      for (let i = 0; i < near.length; i++) signSources[i].intensity = near[i].level * (near[i].spec.intensity ?? 2) * 0.7;
      roof.update(dt, u.uTime.value);
      beams.update(dt, u.uShaftAmt.value);

      backGlowMat.color.copy(u.uHorizon.value).multiplyScalar(1.5 + u.uFlash.value * 0.3);
      bg.copy(u.uSkyTop.value);
      fog.color.copy(u.uFog.value);
    },
  };
  env.setLayout('landscape');
  // dev hook (harness scenarios): force an ambient strike now
  (env as Environment & { strikeNow?: (s?: number) => void }).strikeNow = (s = 1) => {
    strike(s, true);
    env.onThunder(s);
  };
  return env;
}
