// RAIJIN — the samurai thunder-mech (Character module).
//
//   root (layout transform)
//    └ body ─ hips ─ spine ─ chest ─┬ neck ─ head ─ jaw
//                                   ├ haloMount ─ ring (8 drums)
//                                   ├ shoulderL/R ─ pauldron, upperArm ─ forearm ─ hand ─ fingers/thumb/fist
//                                   └ rotor (reactor tomoe)
//
// Arms are driven by analytic 2-bone IK toward world grip targets / pose
// targets; everything animates in update(dt, t) with damped channels and no
// per-frame allocations. Timed sequences (strike, intro) use the shared
// animation clock so turbo / skip stay in sync.

import * as THREE from 'three';
import type { Character, LayoutKind, ReactKind, SceneContext, SceneMode } from '../contracts';
import { clock, ease } from '../../render/anim';
import { radialTexture } from '../materials';
import { MODE_PALETTE, createCharMats, glowSprite } from './mats';
import { buildHead } from './head';
import { buildTorso } from './torso';
import { L_FORE_IK, L_UPPER, buildArm, setCurl, updatePistons, type ArmRig } from './arm';
import { DRUMS, buildHalo } from './halo';
import { ArcSystem, type ArcRegion } from './arcs';
import { makeIKResult, solveTwoBone } from './ik';
import { PRESETS, type LayoutPreset } from './layout';

export { PRESETS } from './layout';

export interface RaijinCharacter extends Character {
  /** Music beat / hit pulse (reactor + thrusters), 0..1. */
  pulse(strength?: number): void;
  /** Current layout preset (mutable: edit then call setLayout again). */
  readonly presets: typeof PRESETS;
}

// ------------------------------------------------------------------ helpers

const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt * 0.001));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** attack / hold / release envelope (ms) with smooth edges. */
function env(t: number, a: number, h: number, r: number): number {
  if (t < 0) return 0;
  if (t < a) return ease.outCubic(t / a);
  if (t < a + h) return 1;
  const x = (t - a - h) / r;
  return x >= 1 ? 0 : 1 - ease.inOutCubic(x);
}

const REACT_DUR: Record<ReactKind, number> = {
  scatter: 1500, trigger: 2600, retrigger: 1600, smallWin: 900, bigWin: 3000, megaWin: 3900, maxWin: 5400, land: 320,
};

const STRIKE_FIRE = 420;
const STRIKE_END = 1150;

interface ArmState {
  rig: ArmRig;
  name: 'left' | 'right';
  cur: THREE.Vector3; // root-local fist target (damped)
  pole: THREE.Vector3; // root-local pole (damped)
  curl: number;
  spread: number;
  glow: number;
  wrist: THREE.Quaternion;
  // strike
  striking: boolean;
  st: number;
  sTarget: THREE.Vector3; // root-local
  sStart: THREE.Vector3;
  sCharge: THREE.Vector3;
  sPunch: THREE.Vector3;
  gripRL: THREE.Vector3 | null;
}

// scratch (module level: zero allocations per frame)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _qI = new THREE.Quaternion();
const _c1 = new THREE.Color();
const _cam = new THREE.Vector3();
const ik = makeIKResult();

export function createCharacter(ctx: SceneContext): RaijinCharacter {
  const object = new THREE.Group();
  object.name = 'raijin';
  const root = new THREE.Group();
  root.name = 'raijinRoot';
  object.add(root);
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const mats = createCharMats(ctx.renderer);
  const torso = buildTorso(mats);
  body.add(torso.hips);
  const headRig = buildHead(mats);
  headRig.head.position.copy(torso.headPivot);
  headRig.head.scale.setScalar(1.3);
  headRig.head.rotation.order = 'YXZ';
  torso.neck.add(headRig.head);

  const halo = buildHalo(mats);
  halo.mount.position.copy(torso.haloMount);
  torso.chest.add(halo.mount);

  const armR = buildArm(mats, 1, torso.shoulderR);
  const armL = buildArm(mats, -1, torso.shoulderL);
  torso.chest.add(armR.pivot, armL.pivot);

  // ---------------------------------------------------------------- glows
  const rt = radialTexture();
  const eyeGlow = glowSprite(rt, 0x38e8ff, 1.1, 0.9);
  eyeGlow.position.copy(headRig.eyeCenter).add(new THREE.Vector3(0, 0, 0.06));
  eyeGlow.scale.set(1.2, 0.4, 1);
  headRig.head.add(eyeGlow);
  const reactorGlow = glowSprite(rt, 0x38e8ff, 1.3, 0.9);
  reactorGlow.position.copy(torso.reactorPos).add(new THREE.Vector3(0, 0, 0.12));
  torso.chest.add(reactorGlow);
  const aura = glowSprite(rt, 0x2a7dff, 9.5, 0.35);
  aura.position.set(0, 0, -0.45);
  aura.renderOrder = -1;
  halo.mount.add(aura);
  const haloGlow = glowSprite(rt, 0xffc93c, 6.4, 0);
  haloGlow.position.set(0, 0, -0.1);
  halo.mount.add(haloGlow);
  const thrusterGlows = torso.thrusters.map((p) => {
    const s = glowSprite(rt, 0x38e8ff, 0.7, 0.7);
    s.position.copy(p);
    torso.chest.add(s);
    return s;
  });
  const fistGlows = [armL, armR].map((a) => {
    const s = glowSprite(rt, 0x9ff4ff, 1.6, 0);
    a.fist.add(s);
    return s;
  });
  const drumGlows = halo.drums.map((d) => {
    const s = glowSprite(rt, 0xffc93c, 1.1, 0);
    s.position.set(0, 0, 0.38);
    d.add(s);
    return s;
  });

  // character key light (reactor glow / strike charge), always present -> no shader recompiles
  const light = new THREE.PointLight(0x38e8ff, 0, 9, 2);
  root.add(light);

  // ---------------------------------------------------------------- arcs
  const arcs = new ArcSystem(mats.arc);
  root.add(arcs.mesh);
  const solid = (m: THREE.Mesh) => {
    const n = (m.material as THREE.Material).name;
    return /armor|gold|crimson|chrome/.test(n);
  };
  const meshesUnder = (o: THREE.Object3D, stop: THREE.Object3D[] = []) => {
    const out: THREE.Mesh[] = [];
    const walk = (n: THREE.Object3D) => {
      if (stop.includes(n)) return;
      if ((n as THREE.Mesh).isMesh) out.push(n as THREE.Mesh);
      n.children.forEach(walk);
    };
    walk(o);
    return out;
  };
  arcs.addRegion('head', meshesUnder(headRig.head), 70, solid);
  arcs.addRegion('chest', torso.chest.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[], 90, solid);
  arcs.addRegion('chest', meshesUnder(torso.spine, [torso.chest]), 30, solid);
  arcs.addRegion('armR', meshesUnder(armR.upper), 70, solid);
  arcs.addRegion('armL', meshesUnder(armL.upper), 70, solid);
  arcs.addRegion('fistR', meshesUnder(armR.fore), 60, solid);
  arcs.addRegion('fistL', meshesUnder(armL.fore), 60, solid);
  arcs.addRegion('paulR', meshesUnder(armR.paul), 50, solid);
  arcs.addRegion('paulL', meshesUnder(armL.paul), 50, solid);
  arcs.addPoints('halo', halo.ring, halo.drums.map((d) => d.position.clone()));
  arcs.addRegion('halo', meshesUnder(halo.ring), 40, (m) => /haloGold/.test((m.material as THREE.Material).name));

  // ---------------------------------------------------------------- state
  const mkArm = (rig: ArmRig, name: 'left' | 'right'): ArmState => ({
    rig, name, cur: new THREE.Vector3(), pole: new THREE.Vector3(0, -1, -1), curl: 1, spread: 0, glow: 0, wrist: new THREE.Quaternion(),
    striking: false, st: 0, sTarget: new THREE.Vector3(), sStart: new THREE.Vector3(), sCharge: new THREE.Vector3(), sPunch: new THREE.Vector3(), gripRL: null,
  });
  const arms = { left: mkArm(armL, 'left'), right: mkArm(armR, 'right') };
  const armList = [arms.left, arms.right];

  let preset: LayoutPreset = PRESETS.landscape;
  let layoutKind: LayoutKind = 'landscape';
  let mode: SceneMode = 'base';
  const col = {
    eye: new THREE.Color(MODE_PALETTE.base.eye),
    accent: new THREE.Color(MODE_PALETTE.base.accent),
    arc: new THREE.Color(MODE_PALETTE.base.arc),
    aura: new THREE.Color(MODE_PALETTE.base.aura),
    blaze: new THREE.Color(MODE_PALETTE.base.blaze),
    auraK: MODE_PALETTE.base.auraK,
  };

  const S = {
    anticip: 0, anticipOn: 0,
    lean: 0, crouch: 0, twist: 0, sway: 0,
    headYaw: 0, headPitch: 0, jaw: 0,
    lookYaw: 0, lookPitch: 0, lookTimer: 0,
    haloAngle: 0, haloSpeed: 0.25, haloGlow: 0,
    eye: 1, reactor: 1, crest: 0, arcs: 0, lines: 1, auraK: 1,
    flickTimer: 1500, flickLeft: 0, flickDip: 1,
    beat: 0,
    power: 1, introT: -1,
    react: null as ReactKind | null, reactT: 0, reactSide: 1,
    land: 1e9,
    shakeDone: false,
    raise: 0, roar: 0,
    drum: new Float32Array(DRUMS),
    chase: -1,
  };

  // ---------------------------------------------------------------- layout
  function applyLayout(kind: LayoutKind) {
    layoutKind = kind;
    preset = PRESETS[kind];
    root.position.copy(preset.pos);
    root.rotation.set(0, preset.rotY, 0);
    root.scale.setScalar(preset.scale);
    root.updateMatrix();
    _m1.copy(root.matrix).invert();
    for (const a of armList) {
      const ap = a.name === 'left' ? preset.left : preset.right;
      a.gripRL = ap.grip ? (a.gripRL ?? new THREE.Vector3()).copy(ap.grip).applyMatrix4(_m1) : null;
      restTarget(a, a.cur);
      restPole(a, a.pole);
      a.curl = ap.curl;
    }
  }

  function restTarget(a: ArmState, out: THREE.Vector3) {
    const ap = a.name === 'left' ? preset.left : preset.right;
    return a.gripRL ? out.copy(a.gripRL) : out.copy(ap.rest);
  }
  function restPole(a: ArmState, out: THREE.Vector3) {
    return out.copy((a.name === 'left' ? preset.left : preset.right).pole);
  }
  const mirror = (a: ArmState, v: THREE.Vector3, out: THREE.Vector3) => out.set(a.rig.side * Math.abs(v.x) * Math.sign(v.x || 1), v.y, v.z);

  // ---------------------------------------------------------------- per frame
  const arcW = arcs.weight;

  function update(dtRaw: number, t: number) {
    const dt = Math.min(dtRaw, 100);
    const T = t;

    // ---- timers
    if (S.react) {
      S.reactT += dt;
      if (S.reactT > REACT_DUR[S.react]) S.react = null;
    }
    S.land += dt;
    if (S.introT >= 0) S.introT += dt;
    S.beat = Math.max(0, S.beat - dt / 260);

    // ---- base targets
    S.anticip = damp(S.anticip, S.anticipOn, 5, dt);
    const an = S.anticip;
    let leanT = preset.lean + an * 0.1;
    let crouchT = -an * 0.06;
    let haloSpeedT = 0.28 + an * 1.6;
    let haloGlowT = an * 0.35;
    let eyeT = 1 + an * 0.9;
    let arcsT = an * 0.22;
    let reactorT = 1 + an * 0.6;
    let crestT = 0;
    let jawT = 0;
    let linesT = 1 + an * 0.5;
    let auraT = 1 + an * 0.8;
    let raiseT = 0, roarT = 0;
    let yawT = preset.headYaw, pitchT = preset.headPitch - an * 0.08;
    let drumChase = an > 0.3 ? 1 : 0;
    for (const r of [arcW]) {
      r.head = 0.3; r.chest = 1; r.armL = 0.5; r.armR = 0.5; r.paulL = 0.6; r.paulR = 0.6; r.halo = 0.8 + an; r.fistL = 0.2; r.fistR = 0.2;
    }

    // micro look
    S.lookTimer -= dt;
    if (S.lookTimer <= 0) {
      S.lookTimer = 1400 + Math.random() * 2600;
      S.lookYaw = (Math.random() - 0.5) * 0.36;
      S.lookPitch = (Math.random() - 0.5) * 0.12;
    }
    yawT += S.lookYaw * (1 - an * 0.7);
    pitchT += S.lookPitch * (1 - an * 0.7);

    // ---- reactions
    if (S.react) {
      const k = S.react, rt2 = S.reactT;
      if (k === 'scatter') {
        const e = env(rt2, 220, 700, 580);
        yawT += S.reactSide * 0.6 * e;
        pitchT -= 0.32 * e;
        haloSpeedT += 2.2 * e;
        eyeT += 0.8 * e;
        arcsT = Math.max(arcsT, 0.35 * e);
        arcW.halo += 4 * e;
        drumChase = Math.max(drumChase, e > 0.05 ? 1 : 0);
      } else if (k === 'trigger' || k === 'retrigger') {
        const s = k === 'trigger' ? 1 : 0.7;
        const e = k === 'trigger' ? env(rt2, 280, 1400, 800) : env(rt2, 200, 800, 550);
        pitchT -= 0.55 * e * s;
        yawT *= 1 - e;
        jawT = Math.max(jawT, e);
        leanT -= 0.2 * e * s;
        roarT = Math.max(roarT, e);
        haloGlowT += 3 * e * s;
        haloSpeedT += 6 * e * s;
        eyeT += 3.2 * e * s;
        arcsT = Math.max(arcsT, 0.9 * e * s);
        reactorT += 2.2 * e * s;
        crestT += 1.6 * env(rt2, 120, 250, 900) * s;
        linesT += 1.5 * e * s;
        auraT += 1.5 * e * s;
        drumChase = 2;
        if (!S.shakeDone && rt2 > 200) {
          ctx.shake(0.55 * s);
          S.shakeDone = true;
        }
      } else if (k === 'smallWin') {
        eyeT += 2.4 * env(rt2, 60, 160, 520);
        pitchT += 0.16 * Math.sin(Math.min(1, rt2 / 520) * Math.PI);
        reactorT += 0.8 * env(rt2, 60, 100, 500);
      } else if (k === 'bigWin' || k === 'megaWin') {
        const s = k === 'bigWin' ? 1 : 1.35;
        const e = k === 'bigWin' ? env(rt2, 420, 1800, 780) : env(rt2, 420, 2600, 880);
        raiseT = Math.max(raiseT, e);
        pitchT -= 0.28 * e;
        yawT *= 1 - e;
        haloSpeedT += 4.5 * e * s;
        haloGlowT += 2.2 * e * s;
        eyeT += 2 * e * s;
        arcsT = Math.max(arcsT, 0.45 * e * s);
        reactorT += 1.6 * e * s;
        crestT += 0.9 * e * s;
        linesT += 1 * e * s;
        auraT += 1 * e * s;
        jawT = Math.max(jawT, k === 'megaWin' ? 0.6 * e : 0);
        drumChase = 2;
      } else if (k === 'maxWin') {
        const e = env(rt2, 450, 3900, 1050);
        raiseT = Math.max(raiseT, e);
        pitchT -= 0.36 * e;
        yawT *= 1 - e;
        jawT = Math.max(jawT, 0.85 * e);
        haloSpeedT += 9 * e;
        haloGlowT += 4.5 * e;
        eyeT += 4.5 * e;
        arcsT = Math.max(arcsT, 1 * e);
        reactorT += 3.5 * e;
        crestT += 2.6 * e;
        linesT += 3 * e;
        auraT += 2.2 * e;
        drumChase = 3;
        if (e > 0.5 && Math.random() < dt / 600) ctx.shake(0.35);
        arcW.head += 2 * e; arcW.armL += 1.5 * e; arcW.armR += 1.5 * e; arcW.fistL += 2 * e; arcW.fistR += 2 * e;
      }
    }
    // land flinch (additive)
    if (S.land < 340) {
      const e = env(S.land, 50, 30, 240);
      crouchT -= 0.09 * e;
      leanT -= 0.07 * e;
      pitchT += 0.12 * e;
    }

    // ---- intro (power-up) overrides
    let power = 1;
    if (S.introT >= 0) {
      const it = S.introT;
      // eyes: flicker on 250..800 ms then stable
      const flick = it < 250 ? 0 : it < 800 ? (Math.sin(it * 0.09) > 0.2 - (it - 250) / 600 ? 1 : 0.1) : 1;
      power = flick;
      reactorT = it < 500 ? 0.05 : reactorT + 1.6 * env(it - 500, 300, 300, 800);
      crestT += 3 * env(it - 850, 90, 140, 650);
      eyeT += 3 * env(it - 800, 80, 300, 700);
      haloSpeedT = it < 900 ? 0.05 : haloSpeedT + 7 * env(it - 900, 350, 300, 650);
      haloGlowT += 2.5 * env(it - 900, 250, 300, 700);
      arcsT = Math.max(arcsT, 0.8 * env(it - 900, 150, 500, 500));
      linesT = it < 600 ? 0.05 : linesT;
      pitchT -= 0.25 * env(it - 700, 300, 500, 600);
      leanT -= 0.08 * env(it - 700, 300, 500, 600);
      drumChase = it > 900 && it < 1900 ? 2 : drumChase;
      if (it > 2100) S.introT = -1;
    }
    S.power = damp(S.power, power, 40, dt);

    // ---- strikes (head look + twist toward the target)
    let strikeW = 0;
    let lookYaw = 0, lookPitch = 0;
    for (const a of armList) {
      if (!a.striking) continue;
      a.st += dt;
      const w = env(a.st, 120, STRIKE_FIRE + 250 - 120, 450);
      if (w > strikeW) {
        strikeW = w;
        _v1.copy(a.sTarget).sub(_v2.set(0, 3.3, 0.3));
        lookYaw = Math.atan2(_v1.x, Math.max(0.5, _v1.z));
        lookPitch = Math.atan2(-_v1.y, Math.hypot(_v1.x, _v1.z));
      }
      // glow: charge, peak at fire, decay
      const g = a.st < STRIKE_FIRE ? ease.inCubic(clamp01(a.st / STRIKE_FIRE)) * 1.2 : a.st < STRIKE_FIRE + 90 ? 2.2 : 2.2 * Math.max(0, 1 - (a.st - STRIKE_FIRE - 90) / 450);
      a.glow = g;
      const reg: ArcRegion = a.name === 'left' ? 'fistL' : 'fistR';
      arcW[reg] += 8 * g;
      arcW[a.name === 'left' ? 'armL' : 'armR'] += 3 * g;
      arcsT = Math.max(arcsT, 0.45 * Math.min(1, g));
      eyeT += 1.2 * Math.min(1, g);
      drumChase = Math.max(drumChase, a.st < STRIKE_FIRE ? 2 : 0);
      if (a.st > STRIKE_END) a.striking = false;
    }
    for (const a of armList) if (!a.striking) a.glow = damp(a.glow, 0, 6, dt);
    yawT = THREE.MathUtils.lerp(yawT, THREE.MathUtils.clamp(lookYaw, -0.75, 0.75), strikeW);
    pitchT = THREE.MathUtils.lerp(pitchT, THREE.MathUtils.clamp(lookPitch, -0.45, 0.55), strikeW * 0.8);
    const twistT = THREE.MathUtils.clamp(lookYaw, -0.6, 0.6) * 0.3 * strikeW;

    // ---- damp channels
    S.lean = damp(S.lean, leanT, 4, dt);
    S.crouch = damp(S.crouch, crouchT, 6, dt);
    S.twist = damp(S.twist, twistT, 6, dt);
    S.headYaw = damp(S.headYaw, yawT, 5, dt);
    S.headPitch = damp(S.headPitch, pitchT, 5, dt);
    S.jaw = damp(S.jaw, jawT, 12, dt);
    S.haloSpeed = damp(S.haloSpeed, haloSpeedT, 2.2, dt);
    S.haloGlow = damp(S.haloGlow, haloGlowT, 6, dt);
    S.eye = damp(S.eye, eyeT, 10, dt);
    S.reactor = damp(S.reactor, reactorT, 6, dt);
    S.crest = damp(S.crest, crestT, 10, dt);
    S.arcs = damp(S.arcs, arcsT, 8, dt);
    S.lines = damp(S.lines, linesT, 5, dt);
    S.auraK = damp(S.auraK, auraT, 3, dt);
    S.raise = damp(S.raise, raiseT, 4.5, dt);
    S.roar = damp(S.roar, roarT, 7, dt);

    // ---- body pose
    const br = Math.sin((T / 3600) * Math.PI * 2); // breathing
    const br2 = Math.sin((T / 3600) * Math.PI * 2 - 0.6);
    body.position.y = S.crouch + br * 0.012;
    body.rotation.y = Math.sin(T / 5300) * 0.025 + S.twist * 0.4;
    body.rotation.z = Math.sin(T / 6700) * 0.012;
    torso.spine.rotation.set(S.lean * 0.45, S.twist * 0.6, 0);
    torso.chest.rotation.set(S.lean * 0.55 + br * 0.012, S.twist * 0.4, 0);
    torso.chest.position.y = 0.95 + br2 * 0.014;
    torso.neck.rotation.set(-S.lean * 0.35 + S.headPitch * 0.3, S.headYaw * 0.3, 0);
    headRig.head.rotation.set(S.headPitch * 0.7, S.headYaw * 0.7, Math.sin(T / 4100) * 0.02);
    headRig.jaw.rotation.x = S.jaw * 0.42;
    armR.pivot.position.y = torso.shoulderR.y + br2 * 0.02;
    armL.pivot.position.y = torso.shoulderL.y + br2 * 0.02;
    S.haloAngle -= S.haloSpeed * dt * 0.001;
    halo.ring.rotation.z = S.haloAngle;
    halo.mount.position.y = torso.haloMount.y + Math.sin(T / 2300) * 0.03;
    torso.rotor.rotation.z = T * 0.0012 * (1 + S.reactor * 0.6);

    root.updateMatrixWorld(true);

    // ---- arms (IK)
    // chest-space transform of root-local points: inv(chestWorld) * rootWorld
    _m1.copy(torso.chest.matrixWorld).invert().multiply(root.matrixWorld);
    for (const a of armList) {
      const ap = a.name === 'left' ? preset.left : preset.right;
      // desired target / pole / curl
      restTarget(a, _v1);
      restPole(a, _pole);
      let curlT = ap.curl;
      let spreadT = 0;
      if (S.raise > 0.001) {
        mirror(a, preset.raise, _v2);
        _v1.lerp(_v2, S.raise);
        _pole.lerp(mirror(a, preset.raisePole, _v3), S.raise);
        curlT = THREE.MathUtils.lerp(curlT, 1, S.raise);
      }
      if (S.roar > 0.001) {
        mirror(a, preset.roar, _v2);
        _v1.lerp(_v2, S.roar);
        _pole.lerp(mirror(a, preset.roarPole, _v3), S.roar);
        curlT = THREE.MathUtils.lerp(curlT, 0.05, S.roar);
        spreadT = S.roar;
      }
      // idle hand motion when free
      if (!a.gripRL) _v1.y += Math.sin(T / 1900 + a.rig.side) * 0.03;
      _q1.setFromEuler(ap.wrist);
      if (a.striking) {
        const st = a.st;
        if (st < 230) a.cur.lerpVectors(a.sStart, a.sCharge, ease.outCubic(st / 230));
        else if (st < 330) a.cur.copy(a.sCharge).addScaledVector(_v3.set(Math.sin(st * 0.9), Math.cos(st * 1.1), 0), 0.015);
        else if (st < STRIKE_FIRE) a.cur.lerpVectors(a.sCharge, a.sPunch, ease.inCubic((st - 330) / (STRIKE_FIRE - 330)));
        else if (st < 600) a.cur.lerpVectors(a.sPunch, a.sCharge, 0.22 * Math.sin(((st - STRIKE_FIRE) / 180) * Math.PI * 0.5));
        else {
          _v3.lerpVectors(a.sPunch, a.sCharge, 0.22);
          a.cur.lerpVectors(_v3, _v1, ease.inOutCubic(clamp01((st - 600) / (STRIKE_END - 600))));
        }
        const sw = st < 600 ? 1 : 1 - clamp01((st - 600) / (STRIKE_END - 600));
        _pole.lerp(mirror(a, preset.chargePole, _v3), sw);
        curlT = THREE.MathUtils.lerp(curlT, 1, sw);
        // aim the fist at the target (wrist)
        if (sw > 0.01) _q1.slerp(_qI, sw);
      } else {
        const k = 1 - Math.exp(-dt * 0.006);
        a.cur.lerp(_v1, k);
      }
      a.pole.lerp(_pole, 1 - Math.exp(-dt * 0.008));
      a.curl = damp(a.curl, curlT, 9, dt);
      a.spread = damp(a.spread, spreadT, 9, dt);
      a.wrist.slerp(_q1, 1 - Math.exp(-dt * 0.01));

      // solve in chest space
      _v2.copy(a.cur).applyMatrix4(_m1);
      _v3.copy(a.pole).transformDirection(_m1);
      solveTwoBone(a.rig.pivot.position, _v2, _v3, L_UPPER, L_FORE_IK, ik);
      a.rig.upper.quaternion.copy(ik.upper);
      a.rig.fore.quaternion.copy(ik.lower);
      a.rig.hand.quaternion.copy(a.wrist);
      a.rig.paul.quaternion.slerpQuaternions(_qI, ik.upper, 0.28);
      updatePistons(a.rig);
      setCurl(a.rig, a.curl, a.spread);
    }

    // ---- eye flicker
    S.flickTimer -= dt;
    if (S.flickTimer <= 0) {
      S.flickTimer = 900 + Math.random() * 3200;
      S.flickLeft = 50 + Math.random() * 90;
      S.flickDip = Math.random() < 0.4 ? 0.25 : 0.7;
    }
    let flick = 1 - 0.05 * Math.sin(T * 0.037) * Math.sin(T * 0.011);
    if (S.flickLeft > 0) {
      S.flickLeft -= dt;
      flick *= S.flickDip;
    }

    // ---- drums chase
    const chaseSpeed = S.react === 'maxWin' ? 0.03 : 0.016;
    for (let i = 0; i < DRUMS; i++) {
      let target = 0;
      if (drumChase >= 1) {
        const ph = (T * chaseSpeed * 0.06 - i / DRUMS) % 1;
        const p = ph < 0 ? ph + 1 : ph;
        target = Math.pow(1 - p, 6) * (drumChase >= 2 ? 1.6 : 1);
      }
      if (drumChase >= 3) target = Math.max(target, 0.8);
      target += S.haloGlow * 0.12;
      S.drum[i] = damp(S.drum[i], target, 18, dt);
    }

    // ---- colours & intensities
    const P = S.power;
    const beat = S.beat;
    mats.eye.color.copy(col.eye).lerp(_c1.set(0xffffff), 0.3).multiplyScalar(3.2 * S.eye * flick * P);
    mats.visor.color.copy(col.eye).multiplyScalar(0.7 * Math.sqrt(S.eye) * flick * P);
    mats.mouth.color.copy(col.eye).multiplyScalar((0.25 + S.jaw * 3.5) * P);
    mats.line.color.copy(col.accent).multiplyScalar(1.5 * S.lines * P);
    mats.lineDim.color.copy(col.accent).multiplyScalar(0.55 * S.lines * P);
    const pulse = 0.85 + 0.15 * Math.sin(T * 0.0045) + beat * 0.8;
    mats.reactor.color.copy(col.accent).lerp(_c1.set(0xffffff), 0.1).multiplyScalar(1.5 * S.reactor * pulse * P);
    mats.thruster.color.copy(col.accent).multiplyScalar((2.4 + an * 2 + beat * 2) * P);
    for (const a of armList) a.rig.ventMat.color.copy(col.accent).multiplyScalar((0.75 + a.glow * 5 + an * 0.6) * P);
    mats.arc.color.copy(col.arc).multiplyScalar(5);
    mats.crestGold.emissiveIntensity = S.crest * 1.4;
    mats.crestGold.emissive.copy(col.blaze);
    mats.haloGold.emissiveIntensity = S.haloGlow * 0.55;
    mats.haloGold.emissive.copy(col.blaze);
    for (let i = 0; i < DRUMS; i++) {
      const m = mats.drumHeads[i];
      m.emissive.copy(col.blaze).lerp(col.eye, 0.35);
      m.emissiveIntensity = S.drum[i] * 2.4;
      const g = drumGlows[i].material as THREE.SpriteMaterial;
      g.opacity = Math.min(0.7, S.drum[i] * 0.3);
      g.color.copy(col.blaze);
    }
    // sprites
    (eyeGlow.material as THREE.SpriteMaterial).color.copy(col.eye).multiplyScalar(0.3 * flick * P * Math.min(3, S.eye));
    (reactorGlow.material as THREE.SpriteMaterial).color.copy(col.accent).multiplyScalar(0.25 * S.reactor * pulse * P);
    reactorGlow.scale.setScalar(0.8 + S.reactor * 0.2);
    (aura.material as THREE.SpriteMaterial).color.copy(col.aura).multiplyScalar(col.auraK * S.auraK * 0.2);
    (haloGlow.material as THREE.SpriteMaterial).opacity = Math.min(1, S.haloGlow * 0.18);
    (haloGlow.material as THREE.SpriteMaterial).color.copy(col.blaze);
    for (const s of thrusterGlows) (s.material as THREE.SpriteMaterial).color.copy(col.accent).multiplyScalar((0.6 + an * 0.6 + beat) * P);
    for (let i = 0; i < 2; i++) {
      const a = armList[i];
      const m = fistGlows[i].material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, a.glow * 0.7);
      m.color.copy(col.arc).multiplyScalar(1 + a.glow);
      fistGlows[i].scale.setScalar(0.9 + Math.min(1.5, a.glow) * 0.55 + Math.random() * 0.15 * a.glow);
    }
    // point light: reactor glow, pulled to the striking fist
    let lg = 0;
    let la: ArmState | null = null;
    for (const a of armList) if (a.glow > lg) (lg = a.glow), (la = a);
    if (la && lg > 0.05) {
      la.rig.fist.getWorldPosition(_v1);
      _v1.applyMatrix4(_m2.copy(root.matrixWorld).invert());
      light.position.copy(_v1);
      light.intensity = 6 + lg * 18;
      light.color.copy(col.arc);
    } else {
      light.position.copy(torso.reactorPos).applyMatrix4(torso.chest.matrixWorld).applyMatrix4(_m2.copy(root.matrixWorld).invert());
      light.position.z += 0.6;
      light.intensity = (1.5 * S.reactor + S.haloGlow * 2) * P;
      light.color.copy(col.accent);
    }

    // ---- arcs
    root.updateMatrixWorld(true);
    arcs.level = Math.min(1, S.arcs);
    arcs.width = 0.028;
    ctx.camera.getWorldPosition(_cam);
    arcs.update(dt, root, _cam);
  }

  // ---------------------------------------------------------------- API
  function chooseArm(targetWorld: THREE.Vector3): ArmState {
    let best = arms.right;
    let bestScore = Infinity;
    for (const a of armList) {
      a.rig.pivot.getWorldPosition(_v1);
      let score = _v1.distanceTo(targetWorld);
      if (a.striking) score += a.st < STRIKE_FIRE + 150 ? 50 : 4;
      if (layoutKind === 'portrait') score += Math.sign(targetWorld.x || 0.001) === (a.name === 'left' ? -1 : 1) ? -3 : 0;
      if (score < bestScore) (bestScore = score), (best = a);
    }
    return best;
  }

  const character: RaijinCharacter = {
    object,
    presets: PRESETS,
    update,
    setLayout(kind) {
      applyLayout(kind);
    },
    getFistWorld(side, out) {
      const a = arms[side];
      a.rig.fist.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(a.rig.fist.matrixWorld);
    },
    anticipate(on) {
      S.anticipOn = on ? 1 : 0;
    },
    strike(target) {
      const a = chooseArm(target);
      root.updateMatrixWorld(true);
      _m2.copy(root.matrixWorld).invert();
      a.sTarget.copy(target).applyMatrix4(_m2);
      // start from the current fist position (root-local)
      a.rig.fist.getWorldPosition(_v1);
      a.sStart.copy(_v1).applyMatrix4(_m2);
      mirror(a, preset.charge, a.sCharge);
      // nudge the charge point a little toward the target's side
      a.sCharge.x += THREE.MathUtils.clamp(a.sTarget.x - a.sCharge.x, -1, 1) * 0.15;
      _v2.subVectors(a.sTarget, a.sCharge).normalize();
      a.sPunch.copy(a.sCharge).addScaledVector(_v2, preset.punch);
      a.cur.copy(a.sStart);
      a.st = 0;
      a.striking = true;
      return clock.wait(STRIKE_FIRE).then(() => {
        S.beat = 1;
        return a.name;
      });
    },
    react(kind) {
      if (kind === 'land') {
        S.land = 0;
        return;
      }
      S.react = kind;
      S.reactT = 0;
      S.shakeDone = false;
      if (kind === 'scatter') S.reactSide = -S.reactSide;
    },
    setMode(m) {
      mode = m;
      const p = MODE_PALETTE[mode];
      targetCol.eye.set(p.eye);
      targetCol.accent.set(p.accent);
      targetCol.arc.set(p.arc);
      targetCol.aura.set(p.aura);
      targetCol.blaze.set(p.blaze);
      targetCol.auraK = p.auraK;
    },
    intro() {
      S.introT = 0;
      S.power = 0;
      return clock.wait(2000);
    },
    pulse(strength = 1) {
      S.beat = Math.max(S.beat, strength);
    },
  };

  // colour transitions toward the mode palette (wrapped update)
  const targetCol = {
    eye: col.eye.clone(), accent: col.accent.clone(), arc: col.arc.clone(), aura: col.aura.clone(), blaze: col.blaze.clone(), auraK: col.auraK,
  };
  const inner = character.update;
  character.update = (dt, t) => {
    const k = 1 - Math.exp(-Math.min(dt, 100) * 0.004);
    col.eye.lerp(targetCol.eye, k);
    col.accent.lerp(targetCol.accent, k);
    col.arc.lerp(targetCol.arc, k);
    col.aura.lerp(targetCol.aura, k);
    col.blaze.lerp(targetCol.blaze, k);
    col.auraK += (targetCol.auraK - col.auraK) * k;
    inner(dt, t);
  };

  applyLayout('landscape');
  return character;
}
