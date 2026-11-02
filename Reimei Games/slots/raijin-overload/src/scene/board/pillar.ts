// Thunder Wild energy pillar: animated plasma/lightning column with bright
// edges and crackling arcs, chrome/gold rails and emitter caps, the kanji 雷
// seal, vertical 3D "WILD" and the gold multiplier coin.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ease } from '../../render/anim';
import { MAT, PALETTE, glow, radialTexture } from '../materials';
import { textGeometry } from '../text3d';
import { MultCoin } from './coin';
import { NOISE, VERT_LOCAL } from './glsl';
import { roundedFrameGeometry, roundedRingFlat } from './shapes';

const W = 0.96; // energy plane width
const Z_ENERGY = 0.262;
const Z_FRONT = 0.3;
const LETTERS = ['W', 'I', 'L', 'D'] as const;
const PLAQUE_Y = 0.56; // talisman plaque centre (spans -1.2 .. 2.32)
const PLAQUE_H = 3.52;
const PLAQUE_W = 0.72;
const LETTER_Y = [1.05, 0.46, -0.13, -0.72];
const KANJI_Y = 1.88;
const DIVIDER_Y = 1.46;
const COIN_Y = -1.79;

const ENERGY_FRAG = /* glsl */ `
  uniform float uTime, uTop, uBot, uFlash, uWin, uSticky, uSeed, uFront, uAlpha;
  uniform vec3 uDeep, uCyan, uCore, uGold;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float x = vPos.x, y = vPos.y;
    float fe = 0.025;
    float inside = smoothstep(uBot - fe, uBot + fe, y) * (1.0 - smoothstep(uTop - fe, uTop + fe, y));
    if (inside < 0.002) discard;
    float t = uTime;
    float ax = abs(x) / ${(W / 2).toFixed(3)};
    // domain-warped plasma rising up the column
    vec2 q = vec2(x * 2.6 + uSeed, y * 0.75 - t * 1.25);
    float w = bfbm(q * 1.2 + vec2(0.0, t * 0.35));
    float n = bfbm3(q + vec2(w * 1.7, w * 1.2));
    vec3 col = mix(uDeep * 0.25, uDeep * 1.7, smoothstep(0.25, 0.85, n));
    // ridged energy veins
    float r1 = 1.0 - abs(bn(vec2(x * 4.5 + w * 2.2, y * 1.5 - t * 2.4 + uSeed)) * 2.0 - 1.0);
    col += uCyan * pow(r1, 10.0) * 1.1;
    // containment rings
    float ring = smoothstep(0.035, 0.0, abs(fract(y * 1.0 + 0.5) - 0.5) - 0.0);
    col += uCyan * ring * 0.25 * (0.6 + 0.4 * sin(t * 3.0 + y));
    // main jagged bolt (re-strikes 11x per second)
    float slot = floor(t * 11.0);
    float bx = jag(y * 0.85, slot * 0.37 + uSeed) * 0.62;
    float d = abs(x - bx);
    col += uCore * exp(-d * 95.0) * 2.6 + uCyan * exp(-d * 20.0) * 0.7;
    // second, thinner flickering bolt
    float s2 = floor(t * 17.0);
    float bx2 = jag(y * 1.3 + 4.0, s2 * 0.71 + uSeed + 11.0) * 0.8;
    float on2 = step(0.4, bh1(s2 + uSeed * 3.0));
    col += (uCore * exp(-abs(x - bx2) * 150.0) * 1.8 + uCyan * exp(-abs(x - bx2) * 35.0) * 0.3) * on2;
    // rising scan bands
    float band = smoothstep(0.9, 1.0, sin(y * 2.4 - t * 3.6) * 0.5 + 0.5);
    col += uCyan * band * 0.3 * (1.0 - ax * 0.5);
    // glass-tube shading
    col *= 0.7 + 0.5 * ax * ax;
    // bright edges
    float edge = smoothstep(0.86, 1.0, ax);
    vec3 edgeCol = mix(uCyan, uGold, clamp(uWin + uSticky * 0.55, 0.0, 1.0));
    col += edgeCol * edge * 0.95 + uCore * pow(ax, 60.0) * 0.7;
    // growth fronts
    float front = exp(-abs(y - uTop) * 9.0) + exp(-abs(y - uBot) * 9.0);
    col += uCore * front * uFront * 2.0;
    // win: gold breathing glow
    col += uGold * uWin * (0.2 + 0.2 * sin(t * 7.0)) * (0.2 + edge);
    col += mix(uCyan, uCore, 0.6) * uFlash * 0.9;
    gl_FragColor = vec4(col, inside * uAlpha * (0.93 + 0.07 * edge));
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform float uTime, uTop, uBot, uAlpha, uFlash, uSeed, uWin;
  uniform vec3 uCyan, uCore, uGold;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float x = vPos.x, y = vPos.y;
    float dy = max(max(uBot - y, y - uTop), 0.0);
    float dx = max(abs(x) - 0.42, 0.0);
    float d = length(vec2(dx, dy));
    float g = exp(-d * 4.5) * 0.2 + exp(-d * 14.0) * 0.32;
    g *= 0.8 + 0.2 * sin(uTime * 8.0 + y * 1.7 + uSeed);
    vec3 tint = mix(uCyan, uGold, uWin * 0.7);
    vec3 col = tint * g * uAlpha + uCore * uFlash * exp(-d * 3.5) * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const ARC_FRAG = /* glsl */ `
  uniform float uTime, uTop, uBot, uAlpha, uSeed;
  uniform vec3 uCyan, uCore;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float x = vPos.x, y = vPos.y;
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float slot = floor(uTime * 7.0 + fk * 0.37);
      float h = bh1(slot * 1.7 + fk * 13.1 + uSeed);
      if (h < 0.5) continue;
      float ay = mix(uBot + 0.35, uTop - 0.35, bh1(slot + fk * 7.7 + uSeed));
      float side = bh1(slot * 3.1 + fk + uSeed) > 0.5 ? 1.0 : -1.0;
      float len = 0.22 + 0.45 * bh1(slot * 5.3 + fk);
      float xs = x * side - 0.46;
      if (xs < 0.0 || xs > len) continue;
      float u = xs / len;
      float yy = ay + jag(xs * 2.2, slot + fk * 3.0) * 0.5 * (u + 0.15);
      float dd = abs(y - yy);
      float fade = (1.0 - u) * (1.0 - u);
      col += (uCore * exp(-dd * 170.0) * 2.2 + uCyan * exp(-dd * 34.0) * 0.45) * fade;
    }
    gl_FragColor = vec4(col * uAlpha, 1.0);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uTop, uBot, uScale, uAlpha;
  varying float vA;
  void main() {
    float s = aSeed;
    float sp = 0.3 + 0.6 * fract(s * 7.13);
    float ph = fract(s * 3.7 + uTime * sp * 0.32);
    float y = mix(uBot, uTop, ph);
    float x = (fract(s * 13.7) - 0.5) * 0.84 + sin(uTime * 3.0 + s * 20.0) * 0.04;
    vec4 mv = modelViewMatrix * vec4(x, y, ${(Z_ENERGY + 0.02).toFixed(3)}, 1.0);
    gl_Position = projectionMatrix * mv;
    float sz = 0.02 + 0.03 * fract(s * 5.1);
    gl_PointSize = uScale * sz / -mv.z;
    vA = sin(ph * 3.14159) * uAlpha * (0.55 + 0.45 * sin(uTime * 23.0 + s * 50.0));
  }
`;
const SPARK_FRAG = /* glsl */ `
  uniform vec3 uCore;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uCore * a * a * vA * 2.5, 1.0);
  }
`;

interface Shared {
  energyGeo: THREE.PlaneGeometry;
  haloGeo: THREE.PlaneGeometry;
  arcGeo: THREE.PlaneGeometry;
  sparkGeo: THREE.BufferGeometry;
  railGeo: THREE.BufferGeometry;
  capGeo: THREE.BufferGeometry;
  stripGeo: THREE.BufferGeometry;
  rivet: THREE.BufferGeometry;
  node: THREE.BufferGeometry;
  plaque: THREE.BufferGeometry;
  plaqueFrame: THREE.BufferGeometry;
  plaqueLine: THREE.BufferGeometry;
  divider: THREE.BufferGeometry;
  gem: THREE.BufferGeometry;
  kanji: THREE.BufferGeometry;
  letters: THREE.BufferGeometry[];
  lockBody: THREE.BufferGeometry;
  lockShackle: THREE.BufferGeometry;
  lockHole: THREE.BufferGeometry;
  letterFace: THREE.MeshStandardMaterial;
  letterSide: THREE.MeshStandardMaterial;
  kanjiFace: THREE.MeshStandardMaterial;
  kanjiGlow: THREE.MeshBasicMaterial;
  chrome: THREE.Material;
  gold: THREE.Material;
  goldDeep: THREE.Material;
  plaqueMat: THREE.Material;
  lineMat: THREE.MeshBasicMaterial;
  neon: THREE.Material;
  neonGold: THREE.Material;
  flareMat: THREE.MeshBasicMaterial;
  quad: THREE.PlaneGeometry;
}
let S: Shared | null = null;

function shared(): Shared {
  if (S) return S;
  const sparkGeo = new THREE.BufferGeometry();
  const N = 44;
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) seeds[i] = (i * 0.618034 + 0.13) % 1;
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

  const letterFace = new THREE.MeshStandardMaterial({ color: 0xffc95a, metalness: 1, roughness: 0.24, emissive: glow(0xff9d1a, 0.42) });
  const letterSide = new THREE.MeshStandardMaterial({ color: 0x6a4210, metalness: 1, roughness: 0.35 });
  const kanjiFace = new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 1, roughness: 0.22, emissive: glow(0xffa62a, 0.3) });
  const kanjiGlow = new THREE.MeshBasicMaterial({ map: radialTexture(), color: glow(PALETTE.cyan, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const plaqueMat = new THREE.MeshPhysicalMaterial({ color: 0x03050b, metalness: 0.2, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.8 });
  const lineMat = new THREE.MeshBasicMaterial({ color: glow(PALETTE.cyan, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const divider = new RoundedBoxGeometry(0.46, 0.022, 0.03, 2, 0.01);
  const gem = new THREE.OctahedronGeometry(0.05, 0);
  gem.scale(1, 1.3, 0.6);
  const lockShackle = new THREE.TorusGeometry(0.052, 0.016, 8, 20, Math.PI);
  lockShackle.translate(0, 0.07, 0);
  const lockHole = new THREE.CircleGeometry(0.022, 16);
  lockHole.translate(0, 0.008, 0.042);
  const flareMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: glow(PALETTE.lightning, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  S = {
    energyGeo: new THREE.PlaneGeometry(W, 5, 1, 1),
    haloGeo: new THREE.PlaneGeometry(2.6, 6, 1, 1),
    arcGeo: new THREE.PlaneGeometry(2.4, 5, 1, 1),
    sparkGeo,
    railGeo: new RoundedBoxGeometry(0.05, 1, 0.07, 2, 0.02),
    capGeo: new RoundedBoxGeometry(1.03, 0.085, 0.12, 2, 0.03),
    stripGeo: new THREE.BoxGeometry(0.92, 0.014, 0.012),
    rivet: new THREE.SphereGeometry(0.018, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
    node: new THREE.OctahedronGeometry(0.04, 1),
    plaque: new RoundedBoxGeometry(PLAQUE_W - 0.04, PLAQUE_H - 0.04, 0.04, 3, 0.06),
    plaqueFrame: roundedFrameGeometry(PLAQUE_W + 0.04, PLAQUE_H + 0.04, 0.045, 0.12, 0.03, 0.012),
    plaqueLine: roundedRingFlat(PLAQUE_W - 0.1, PLAQUE_H - 0.1, 0.009, 0.07),
    divider,
    gem,
    kanji: textGeometry('雷', { font: 'kanji', size: 0.52, depth: 0.05, bevel: 0.01, bevelSegments: 2, curveSegments: 4 }),
    letters: LETTERS.map((l) => textGeometry(l, { size: 0.46, depth: 0.07, bevel: 0.016, bevelSegments: 2, curveSegments: 5 })),
    lockBody: new RoundedBoxGeometry(0.17, 0.13, 0.07, 2, 0.025),
    lockShackle,
    lockHole,
    letterFace,
    letterSide,
    kanjiFace,
    kanjiGlow,
    chrome: MAT.chrome(),
    gold: MAT.gold(),
    goldDeep: MAT.goldDeep(),
    plaqueMat,
    lineMat,
    neon: MAT.neon(PALETTE.cyan, 5),
    neonGold: MAT.neon(0xffc93c, 4),
    flareMat,
    quad: new THREE.PlaneGeometry(1, 1),
  };
  return S;
}

const col = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
/** deterministic 0..1800 ms jitter so neighbouring coins do not flip in sync */
const reelJitter = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1 * 1800;

export class Pillar {
  readonly group = new THREE.Group();
  readonly coin = new MultCoin();
  active = false;
  sticky = false;
  /** 0..1 expansion from the landing cell. */
  grow = 0;
  private rowY = 0;
  private top = 0;
  private bot = 0;
  private alpha = 0;
  private flash = 0;
  private win = 0;
  private winTarget = 0;
  private stickyK = 0;
  private coinK = 0;
  /** idle wobble blend-in after the coin settled (0..1) */
  private idleK = 0;
  /** ms until the next showy coin flip, and flip progress (-1 = none) */
  private flipIn = 4000;
  private flipT = -1;
  private lettersT = -1;
  private collapseT = -1;
  private time = 0;
  private energyU: Record<string, THREE.IUniform>;
  private haloU: Record<string, THREE.IUniform>;
  private arcU: Record<string, THREE.IUniform>;
  private sparkU: Record<string, THREE.IUniform>;
  private rails: THREE.Mesh[] = [];
  private caps: THREE.Group[] = [];
  private letters: THREE.Mesh[] = [];
  private plaque = new THREE.Group();
  private uniformsList: Record<string, THREE.IUniform>[];
  private lock = new THREE.Group();
  private flare: THREE.Mesh;
  private flareMat: THREE.MeshBasicMaterial;
  private railMat: THREE.MeshStandardMaterial;
  private seed: number;

  constructor(readonly reel: number) {
    const s = shared();
    this.seed = reel * 3.17 + 1.3;
    this.group.position.x = reel - 2;
    this.group.visible = false;

    const baseU = () => ({
      uTime: { value: 0 },
      uTop: { value: 0 },
      uBot: { value: 0 },
      uAlpha: { value: 1 },
      uSeed: { value: this.seed },
      uCyan: { value: col(PALETTE.cyan, 1) },
      uCore: { value: col(PALETTE.lightning, 1) },
      uGold: { value: col(0xffc93c, 1.6) },
    });
    this.energyU = { ...baseU(), uFlash: { value: 0 }, uWin: { value: 0 }, uSticky: { value: 0 }, uFront: { value: 0 }, uDeep: { value: col(0x0d2f9a, 1) } };
    const energy = new THREE.Mesh(
      s.energyGeo,
      new THREE.ShaderMaterial({ uniforms: this.energyU, vertexShader: VERT_LOCAL, fragmentShader: ENERGY_FRAG, transparent: true, depthWrite: false }),
    );
    energy.position.z = Z_ENERGY;
    energy.renderOrder = 3;

    this.haloU = { ...baseU(), uFlash: { value: 0 }, uWin: { value: 0 } };
    const halo = new THREE.Mesh(
      s.haloGeo,
      new THREE.ShaderMaterial({ uniforms: this.haloU, vertexShader: VERT_LOCAL, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.position.z = -0.34;
    halo.renderOrder = 1;

    this.arcU = baseU();
    const arcs = new THREE.Mesh(
      s.arcGeo,
      new THREE.ShaderMaterial({ uniforms: this.arcU, vertexShader: VERT_LOCAL, fragmentShader: ARC_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    arcs.position.z = Z_ENERGY + 0.01;
    arcs.renderOrder = 4;

    this.sparkU = { ...baseU(), uScale: { value: 800 } };
    const sparks = new THREE.Points(
      s.sparkGeo,
      new THREE.ShaderMaterial({ uniforms: this.sparkU, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    sparks.frustumCulled = false;
    sparks.renderOrder = 4;

    // rails + emitter caps
    this.railMat = (MAT.gunmetal() as THREE.MeshStandardMaterial).clone();
    this.railMat.metalness = 1;
    this.railMat.roughness = 0.3;
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(s.railGeo, this.railMat);
      r.position.set(sx * 0.5, 0, Z_FRONT - 0.02);
      this.rails.push(r);
      this.group.add(r);
    }
    for (const sy of [1, -1]) {
      const c = new THREE.Group();
      const body = new THREE.Mesh(s.capGeo, s.gold);
      const strip = new THREE.Mesh(s.stripGeo, s.neon);
      strip.position.set(0, -sy * 0.05, 0.03);
      c.add(body, strip);
      for (const rx of [-0.42, 0.42]) {
        const rv = new THREE.Mesh(s.rivet, s.chrome);
        rv.position.set(rx, 0, 0.058);
        c.add(rv);
      }
      const node = new THREE.Mesh(s.node, s.neon);
      node.position.set(0, 0, 0.065);
      node.scale.set(1.6, 0.8, 0.6);
      c.add(node);
      c.position.z = Z_FRONT - 0.02;
      this.caps.push(c);
      this.group.add(c);
    }

    // talisman plaque: smoked black glass, gold frame, cyan inlay, kanji + divider
    const panel = new THREE.Mesh(s.plaque, s.plaqueMat);
    panel.renderOrder = 4;
    const frame = new THREE.Mesh(s.plaqueFrame, s.gold);
    frame.position.z = 0.012;
    const inlay = new THREE.Mesh(s.plaqueLine, s.lineMat);
    inlay.position.z = 0.024;
    inlay.renderOrder = 5;
    const kanji = new THREE.Mesh(s.kanji, [s.kanjiFace, s.letterSide]);
    kanji.position.set(0, KANJI_Y - PLAQUE_Y, 0.04);
    const kGlow = new THREE.Mesh(s.quad, s.kanjiGlow);
    kGlow.position.set(0, KANJI_Y - PLAQUE_Y, 0.024);
    kGlow.scale.setScalar(0.95);
    kGlow.renderOrder = 5;
    const div = new THREE.Mesh(s.divider, s.gold);
    div.position.set(0, DIVIDER_Y - PLAQUE_Y, 0.03);
    const gem = new THREE.Mesh(s.gem, s.neon);
    gem.position.set(0, DIVIDER_Y - PLAQUE_Y, 0.05);
    this.plaque.add(panel, frame, inlay, kGlow, kanji, div, gem);
    this.plaque.position.set(0, PLAQUE_Y, Z_FRONT - 0.01);

    // WILD letters (inset in the plaque)
    LETTERS.forEach((_, i) => {
      const m = new THREE.Mesh(s.letters[i], [s.letterFace, s.letterSide]);
      m.position.set(0, LETTER_Y[i], Z_FRONT + 0.035);
      this.letters.push(m);
      this.group.add(m);
    });

    // coin
    this.coin.group.position.set(0, COIN_Y, Z_FRONT + 0.03);

    // sticky lock badge, hung on the coin
    const lb = new THREE.Mesh(s.lockBody, s.gold);
    const ls = new THREE.Mesh(s.lockShackle, s.chrome);
    const lh = new THREE.Mesh(s.lockHole, s.neon);
    this.lock.add(lb, ls, lh);
    this.lock.position.set(0.3, COIN_Y + 0.36, Z_FRONT + 0.11);

    // landing flare
    this.flareMat = s.flareMat.clone();
    this.flare = new THREE.Mesh(s.quad, this.flareMat);
    this.flare.renderOrder = 8;

    this.group.add(halo, energy, arcs, sparks, this.plaque, this.coin.group, this.lock, this.flare);
    this.uniformsList = [this.haloU, this.arcU, this.sparkU];
  }

  /** Render every part once, invisibly, so the shader programs compile at load. */
  warm(on: boolean) {
    if (this.active) return;
    this.group.visible = on;
    this.group.scale.setScalar(on ? 1e-4 : 1);
    if (!on) return;
    this.energyU.uAlpha.value = 0;
    for (const u of this.uniformsList) u.uAlpha.value = 0;
    for (const l of this.letters) l.visible = true;
    this.plaque.visible = this.coin.group.visible = this.lock.visible = true;
  }

  /** Start an expansion from `row` (-1 = from the middle, starting wild). */
  begin(row: number, mult: number, sticky: boolean) {
    this.active = true;
    this.group.visible = true;
    this.collapseT = -1;
    this.sticky = sticky;
    this.rowY = 2 - (row < 0 ? 2 : row);
    this.grow = 0;
    this.alpha = 1;
    this.flash = 1;
    this.coinK = 0;
    this.idleK = 0;
    this.flipT = -1;
    this.flipIn = 3500 + reelJitter(this.reel);
    this.lettersT = -1;
    this.coin.setMult(mult);
    this.flare.position.set(0, this.rowY, Z_FRONT + 0.1);
    this.layout();
  }

  /** Fully expanded instantly (sticky carried over / restore). */
  showInstant(mult: number, sticky: boolean) {
    this.begin(2, mult, sticky);
    this.flash = 0.4;
    this.grow = 1;
    this.coinK = 1;
    this.idleK = 1;
    this.lettersT = 10000;
    this.layout();
  }

  setGrow(k: number) {
    this.grow = k;
    if (k >= 0.55 && this.lettersT < 0) this.lettersT = 0;
  }

  private plaqueK() {
    return this.lettersT < 0 ? 0 : ease.outBack(Math.min(1, this.lettersT / 240));
  }

  setCoin(k: number) {
    this.coinK = k;
  }

  coinSettled() {
    this.coinK = 1;
    this.coin.settle();
    this.flash = Math.max(this.flash, 0.35);
  }

  setWin(on: boolean) {
    this.winTarget = on ? 1 : 0;
  }

  /** Collapse + fade out, then deactivate. */
  collapse() {
    if (!this.active || this.collapseT >= 0) return;
    this.collapseT = 0;
  }

  /** World-space y-extent currently covered (for hiding symbols). */
  covers(y: number): boolean {
    return this.active && this.collapseT < 0 && y + 0.42 <= this.top && y - 0.42 >= this.bot;
  }

  private layout() {
    const g = this.grow;
    const shrink = this.collapseT >= 0 ? ease.inCubic(Math.min(1, this.collapseT)) : 0;
    let top = this.rowY + 0.5 + (2.5 - this.rowY - 0.5) * g;
    let bot = this.rowY - 0.5 + (-2.5 - this.rowY + 0.5) * g;
    if (shrink > 0) {
      top = top + (0 - top) * shrink;
      bot = bot + (0 - bot) * shrink;
    }
    this.top = top;
    this.bot = bot;
    const h = Math.max(0.001, top - bot);
    for (const r of this.rails) {
      r.scale.y = h;
      r.position.y = (top + bot) / 2;
    }
    this.caps[0].position.y = top - 0.04;
    this.caps[1].position.y = bot + 0.04;
  }

  update(dt: number, t: number, pointScale: number) {
    if (!this.active) return;
    this.time += dt;
    const sec = this.time / 1000;
    if (this.collapseT >= 0) {
      this.collapseT += dt / 220;
      this.alpha = Math.max(0, 1 - this.collapseT);
      if (this.collapseT >= 1) {
        this.active = false;
        this.group.visible = false;
        this.collapseT = -1;
        this.win = this.winTarget = 0;
        return;
      }
    }
    this.layout();
    this.flash = Math.max(0, this.flash - dt / 380);
    this.win += (this.winTarget - this.win) * Math.min(1, dt / 120);
    this.stickyK += ((this.sticky ? 1 : 0) - this.stickyK) * Math.min(1, dt / 200);
    const wrap = sec % 600;

    const e = this.energyU;
    e.uTime.value = wrap;
    e.uTop.value = this.top;
    e.uBot.value = this.bot;
    e.uFlash.value = this.flash;
    e.uWin.value = this.win;
    e.uSticky.value = this.stickyK;
    e.uFront.value = Math.max(0, 1 - this.grow) * 0.9;
    e.uAlpha.value = this.alpha;
    for (const u of this.uniformsList) {
      u.uTime.value = wrap;
      u.uTop.value = this.top;
      u.uBot.value = this.bot;
      u.uAlpha.value = this.alpha;
    }
    this.haloU.uFlash.value = this.flash;
    this.haloU.uWin.value = this.win;
    this.sparkU.uScale.value = pointScale;

    // rails: chrome -> gold when sticky
    const sk = this.stickyK;
    this.railMat.color.setRGB(0.024 + 0.95 * sk, 0.028 + 0.55 * sk, 0.04 + 0.04 * sk);

    // landing flare
    const fk = this.flash;
    this.flareMat.opacity = fk;
    this.flare.scale.setScalar(1.0 + (1 - fk) * 1.6);

    // letters: staggered pop-in, then a travelling shimmer
    const a = this.alpha;
    if (this.lettersT >= 0) this.lettersT += dt;
    for (let i = 0; i < this.letters.length; i++) {
      const m = this.letters[i];
      const lt = this.lettersT < 0 ? 0 : Math.min(1, Math.max(0, (this.lettersT - 120 - i * 60) / 260));
      const pop = lt <= 0 ? 0 : ease.outBack(lt);
      const wave = Math.max(0, Math.sin(sec * 2.6 - i * 0.7)) ** 6;
      m.visible = pop > 0.001;
      m.scale.setScalar(Math.max(0.001, pop * a * (1 + wave * 0.08)));
      m.position.z = Z_FRONT + 0.035 + wave * 0.03;
      m.rotation.y = (1 - lt) * 1.4;
    }
    const sealPop = this.plaqueK();
    this.plaque.visible = sealPop > 0.001;
    this.plaque.scale.set(Math.max(0.001, (0.6 + 0.4 * sealPop) * a), Math.max(0.001, sealPop * a), 1);

    // coin: spins in with a bounce, then idles with a wobble
    const ck = this.coinK;
    this.coin.group.visible = ck > 0.001;
    this.coin.group.scale.setScalar(Math.max(0.001, ck * a));
    if (ck >= 1) this.idleK = Math.min(1, this.idleK + dt / 500);
    const idle = Math.sin(sec * 1.7 + this.seed) * 0.22 * this.idleK * this.idleK;
    let flip = 0;
    if (ck >= 1) {
      if (this.flipT >= 0) {
        this.flipT += dt / 650;
        flip = ease.inOutCubic(Math.min(1, this.flipT)) * Math.PI * 2;
        if (this.flipT >= 1) this.flipT = -1;
      } else if ((this.flipIn -= dt) <= 0) {
        this.flipT = 0;
        this.flipIn = 5200 + reelJitter(this.reel + ((sec * 10) | 0));
      }
    }
    this.coin.spinner.rotation.y = (1 - Math.min(1, ck)) * Math.PI * 4 + idle + flip;
    this.coin.group.position.y = COIN_Y + Math.sin(sec * 2.1 + this.seed) * 0.025;
    this.coin.update(dt, t);

    // sticky lock
    this.lock.visible = this.stickyK > 0.02 && sealPop > 0.5;
    this.lock.scale.setScalar(Math.max(0.001, this.stickyK * a * 1.55));
    this.lock.rotation.z = Math.sin(sec * 2.4) * 0.12;
  }
}
