// RAIJIN materials: clones of the shared PBR library (never mutate the shared
// singletons) + the character's own animated emissive materials and
// procedural canvas textures (mitsudomoe drum heads).

import * as THREE from 'three';
import type { SceneMode } from '../contracts';
import { MAT, PALETTE, canvasTexture, glow, grungeTexture } from '../materials';
import { tomoePoly } from './shapes';

export interface ModePalette {
  eye: number;
  accent: number;
  arc: number;
  aura: number;
  /** aura strength multiplier */
  auraK: number;
  /** emissive tint of gold parts when blazing */
  blaze: number;
}

export const MODE_PALETTE: Record<SceneMode, ModePalette> = {
  base: { eye: 0x38e8ff, accent: 0x38e8ff, arc: 0x9ff4ff, aura: 0x2a7dff, auraK: 0.55, blaze: 0xffc93c },
  overcharge: { eye: 0xcff6ff, accent: 0x6fd8ff, arc: 0xf0fcff, aura: 0x5a9dff, auraK: 0.95, blaze: 0xe6fbff },
  lock: { eye: 0xff3b24, accent: 0xffb028, arc: 0xffd36b, aura: 0xff2a1a, auraK: 0.9, blaze: 0xffb028 },
  god: { eye: 0xffe08a, accent: 0xa05cff, arc: 0xd9b8ff, aura: 0x9b4dff, auraK: 1.1, blaze: 0xffd36b },
};

export interface CharMats {
  armor: THREE.MeshStandardMaterial;
  armorLight: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  goldDeep: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  crimson: THREE.MeshPhysicalMaterial;
  crimsonDark: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  /** animated (crest flash / overload) */
  crestGold: THREE.MeshStandardMaterial;
  haloGold: THREE.MeshStandardMaterial;
  /** HDR unlit glows */
  eye: THREE.MeshBasicMaterial;
  visor: THREE.MeshBasicMaterial;
  line: THREE.MeshBasicMaterial;
  lineDim: THREE.MeshBasicMaterial;
  reactor: THREE.MeshBasicMaterial;
  mouth: THREE.MeshBasicMaterial;
  thruster: THREE.MeshBasicMaterial;
  ventL: THREE.MeshBasicMaterial;
  ventR: THREE.MeshBasicMaterial;
  drumHeads: THREE.MeshStandardMaterial[];
  drumBack: THREE.MeshStandardMaterial;
  arc: THREE.MeshBasicMaterial;
  all: THREE.Material[];
}

function std(base: THREE.Material, patch: Partial<THREE.MeshStandardMaterialParameters>, name: string): THREE.MeshStandardMaterial {
  const m = (base as THREE.MeshStandardMaterial).clone();
  m.setValues(patch);
  m.name = name;
  return m;
}

const basic = (color: number, k: number, name: string, extra: THREE.MeshBasicMaterialParameters = {}) => {
  const m = new THREE.MeshBasicMaterial({ color: glow(color, k), toneMapped: false, ...extra });
  m.name = name;
  return m;
};

// ------------------------------------------------------------------ textures

/** Draws a mitsudomoe (three commas) centred at (c, c) with outer radius R. */
function drawTomoe(ctx: CanvasRenderingContext2D, c: number, R: number, rot: number) {
  for (let k = 0; k < 3; k++) {
    const pts = tomoePoly(R, rot + (k * Math.PI * 2) / 3);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(c + x, c - y) : ctx.moveTo(c + x, c - y)));
    ctx.closePath();
    ctx.fill();
  }
}

let headTex: { map: THREE.Texture; glowMap: THREE.Texture } | null = null;
export function drumHeadTextures() {
  if (headTex) return headTex;
  const S = 512, c = S / 2;
  const map = canvasTexture(S, S, (ctx) => {
    // aged hide
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, '#efe4cb');
    g.addColorStop(0.75, '#d9c9a6');
    g.addColorStop(0.93, '#9c8662');
    g.addColorStop(1, '#3a2c1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // hide fibres
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = rnd() > 0.5 ? '#6b5434' : '#fff6e0';
      ctx.lineWidth = 1 + rnd() * 2;
      const a = rnd() * Math.PI * 2, r = rnd() * c * 0.9;
      ctx.beginPath();
      ctx.arc(c, c, r, a, a + rnd() * 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // black outer band + gold pinstripe
    ctx.lineWidth = S * 0.05;
    ctx.strokeStyle = '#0c0a0a';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = S * 0.012;
    ctx.strokeStyle = '#d9a52c';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    // tomoe: gold outline under black fill
    ctx.fillStyle = '#c8901f';
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(1.05, 1.05);
    ctx.translate(-c, -c);
    drawTomoe(ctx, c, c * 0.62, 0.3);
    ctx.restore();
    ctx.fillStyle = '#100c0c';
    drawTomoe(ctx, c, c * 0.6, 0.3);
    ctx.fillStyle = '#e0ac30';
    ctx.beginPath();
    ctx.arc(c, c, S * 0.025, 0, Math.PI * 2);
    ctx.fill();
  });
  const glowMap = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#fff';
    drawTomoe(ctx, c, c * 0.6, 0.3);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = S * 0.012;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.74, 0, Math.PI * 2);
    ctx.stroke();
  });
  headTex = { map, glowMap };
  return headTex;
}

// ------------------------------------------------------------------ reflection env

let envTex: THREE.Texture | null = null;
/**
 * RAIJIN's own reflection environment: a dark storm "photo studio" with a
 * cool key softbox, magenta/cyan rim strips, a warm low bounce and a few neon
 * sign slivers on the horizon. Gives metals controlled, contrasted
 * reflections instead of the stage's bright neutral room.
 */
export function charEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (envTex) return envTex;
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float y = vP.y;
          vec3 bot = vec3(0.004, 0.004, 0.008);
          vec3 hor = vec3(0.06, 0.07, 0.12);
          vec3 top = vec3(0.16, 0.2, 0.36);
          vec3 c = y < 0.0 ? mix(hor, bot, smoothstep(0.0, -0.5, y)) : mix(hor, top, smoothstep(0.0, 0.8, y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  const box = (w: number, h: number, color: THREE.ColorRepresentation, k: number, dir: [number, number, number], dist = 20) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    const d = new THREE.Vector3(...dir).normalize();
    m.position.copy(d).multiplyScalar(dist);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box(22, 13, 0xd8e6ff, 1.5, [-0.45, 0.62, 0.65]); // key softbox
  box(30, 5, 0xbfd4ff, 0.8, [0.1, 1, 0.15]); // overhead strip
  box(3, 18, 0x38e8ff, 1.4, [0.85, 0.25, -0.45]); // cyan rim
  box(3, 18, 0xff2fa0, 1.1, [-0.85, 0.25, -0.45]); // magenta rim
  box(34, 6, 0xff9a4a, 0.22, [0, -0.35, 0.9]); // warm bounce
  box(2.5, 1.2, 0xff2fa0, 1.6, [0.6, 0.05, 0.8]); // neon slivers
  box(4, 0.6, 0x38e8ff, 1.6, [-0.7, 0.1, 0.7]);
  box(1.4, 2.2, 0xffc93c, 1.2, [0.95, 0.05, 0.2]);
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(scene, 0.015).texture;
  pm.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return envTex;
}

// ------------------------------------------------------------------ library

export function createCharMats(renderer?: THREE.WebGLRenderer): CharMats {
  const armor = std(MAT.gunmetal(), { color: 0x4a556e, roughness: 0.4, metalness: 0.55, envMapIntensity: 1.0 }, 'raijin-armor');
  const armorLight = std(MAT.gunmetal(), { color: 0x7d879c, roughness: 0.33, metalness: 0.62, envMapIntensity: 1.0 }, 'raijin-armorLight');
  const dark = std(MAT.blackSteel(), { color: 0x1b1f28, roughness: 0.5, metalness: 0.5 }, 'raijin-dark');
  const gold = std(MAT.gold(), { color: 0xeaae40, roughness: 0.3, roughnessMap: grungeTexture(), envMapIntensity: 1.0 }, 'raijin-gold');
  const goldDeep = std(MAT.goldDeep(), {}, 'raijin-goldDeep');
  const chrome = std(MAT.chrome(), { color: 0xc9d2de, roughness: 0.14 }, 'raijin-chrome');
  const crimson = (MAT.crimsonLacquer() as THREE.MeshPhysicalMaterial).clone();
  crimson.name = 'raijin-crimson';
  crimson.color.set(0xa3101c);
  crimson.roughness = 0.32;
  crimson.roughnessMap = grungeTexture();
  const crimsonDark = crimson.clone();
  crimsonDark.name = 'raijin-crimsonDark';
  crimsonDark.color.set(0x4a070d);
  const rubber = std(MAT.rubber(), {}, 'raijin-rubber');
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fe8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false, name: 'raijin-glass',
  });
  const crestGold = std(MAT.gold(), { color: 0xf0b545, roughness: 0.24, roughnessMap: grungeTexture(), emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0, envMapIntensity: 1.0 }, 'raijin-crestGold');
  const haloGold = std(MAT.gold(), { color: 0xe6aa3e, roughness: 0.3, roughnessMap: grungeTexture(), emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0, envMapIntensity: 1.0 }, 'raijin-haloGold');

  const eye = basic(PALETTE.cyan, 6, 'raijin-eye');
  const visor = basic(PALETTE.cyan, 2.2, 'raijin-visor');
  const line = basic(PALETTE.cyan, 1.6, 'raijin-line');
  const lineDim = basic(PALETTE.cyan, 0.9, 'raijin-lineDim');
  const reactor = basic(PALETTE.cyan, 5, 'raijin-reactor');
  const mouth = basic(PALETTE.cyan, 0.6, 'raijin-mouth');
  const thruster = basic(PALETTE.cyan, 3, 'raijin-thruster');
  const ventL = basic(PALETTE.cyan, 1.6, 'raijin-ventL');
  const ventR = basic(PALETTE.cyan, 1.6, 'raijin-ventR');
  const arc = new THREE.MeshBasicMaterial({
    color: glow(0x9ff4ff, 6), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, name: 'raijin-arc',
  });

  const tex = drumHeadTextures();
  const drumBase = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex.map, roughness: 0.78, metalness: 0, emissive: new THREE.Color(PALETTE.cyan), emissiveMap: tex.glowMap, emissiveIntensity: 0, name: 'raijin-drumHead',
  });
  const drumHeads = Array.from({ length: 8 }, (_, i) => {
    const m = drumBase.clone();
    m.name = `raijin-drumHead${i}`;
    return m;
  });
  const drumBack = std(MAT.drumSkin(), { color: 0xc9b896 }, 'raijin-drumBack');

  if (renderer) {
    const env = charEnvMap(renderer);
    for (const m of [armor, armorLight, dark, gold, goldDeep, chrome, crimson, crimsonDark, rubber, glass, crestGold, haloGold, drumBack, ...drumHeads] as THREE.MeshStandardMaterial[]) m.envMap = env;
  }
  const all: THREE.Material[] = [armor, armorLight, dark, gold, goldDeep, chrome, crimson, crimsonDark, rubber, glass, crestGold, haloGold, eye, visor, line, lineDim, reactor, mouth, thruster, ventL, ventR, arc, drumBack, ...drumHeads];
  return { armor, armorLight, dark, gold, goldDeep, chrome, crimson, crimsonDark, rubber, glass, crestGold, haloGold, eye, visor, line, lineDim, reactor, mouth, thruster, ventL, ventR, drumHeads, drumBack, arc, all };
}

/** Soft additive glow sprite. */
export function glowSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, size: number, opacity = 1): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}
