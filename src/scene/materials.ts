// Shared material library so every module has the same premium look.
// Materials are shared singletons: CLONE before changing per-instance values
// (colour, emissiveIntensity, clipping planes...).

import * as THREE from 'three';

export const PALETTE = {
  night: 0x04050c,
  nightBlue: 0x0b1430,
  storm: 0x1a2550,
  cyan: 0x38e8ff,
  lightning: 0xe6fbff,
  gold: 0xffc93c,
  goldDeep: 0xe09a1a,
  crimson: 0xb3121f,
  gunmetal: 0x2a2f3a,
  magenta: 0xff2fa0,
  sakura: 0xff8fc0,
  violet: 0x8a4dff,
} as const;

/** HDR emissive colour (values > 1 trigger bloom). */
export const glow = (color: THREE.ColorRepresentation, intensity = 3) => new THREE.Color(color).multiplyScalar(intensity);

// ---------------------------------------------------------------- procedural maps

let grunge: THREE.Texture | null = null;
/** Tileable grunge/brushed noise used as roughness/bump detail (cached). */
export function grungeTexture(): THREE.Texture {
  if (grunge) return grunge;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // value noise octaves
  const grid = (n: number) => Array.from({ length: n * n }, rnd);
  const octaves = [4, 8, 16, 32, 64].map((n) => ({ n, g: grid(n) }));
  const sample = (g: number[], n: number, x: number, y: number) => {
    const fx = (x / size) * n, fy = (y / size) * n;
    const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * n + x0] + (g[y0 * n + x1] - g[y0 * n + x0]) * sx;
    const b = g[y1 * n + x0] + (g[y1 * n + x1] - g[y1 * n + x0]) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, tot = 0;
      for (const o of octaves) {
        v += sample(o.g, o.n, x, y) * amp;
        tot += amp;
        amp *= 0.55;
      }
      v /= tot;
      // fine horizontal brushing
      v = v * 0.8 + 0.2 * Math.abs(Math.sin(y * 1.7 + rnd() * 0.6));
      const p = (y * size + x) * 4;
      const b = Math.round(v * 255);
      img.data[p] = img.data[p + 1] = img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  grunge = new THREE.CanvasTexture(c);
  grunge.wrapS = grunge.wrapT = THREE.RepeatWrapping;
  grunge.colorSpace = THREE.NoColorSpace;
  return grunge;
}

// ---------------------------------------------------------------- materials

const cache = new Map<string, THREE.Material>();
function once<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = key;
    cache.set(key, m);
  }
  return m;
}

export const MAT = {
  /** Dark armour steel. */
  gunmetal: () =>
    once('gunmetal', () => new THREE.MeshStandardMaterial({ color: PALETTE.gunmetal, metalness: 0.85, roughness: 0.38, roughnessMap: grungeTexture() })),
  /** Near-black steel for faceplates and frames. */
  blackSteel: () =>
    once('blackSteel', () => new THREE.MeshStandardMaterial({ color: 0x0e1016, metalness: 0.8, roughness: 0.45, roughnessMap: grungeTexture() })),
  /** Polished gold trims, crest, coins. */
  gold: () => once('gold', () => new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1, roughness: 0.22 })),
  /** Darker antique gold. */
  goldDeep: () => once('goldDeep', () => new THREE.MeshStandardMaterial({ color: PALETTE.goldDeep, metalness: 1, roughness: 0.35, roughnessMap: grungeTexture() })),
  chrome: () => once('chrome', () => new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 1, roughness: 0.12 })),
  /** Glossy red lacquer (armour accents, drum bodies). */
  crimsonLacquer: () =>
    once('crimsonLacquer', () => new THREE.MeshPhysicalMaterial({ color: PALETTE.crimson, metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 })),
  /** Glossy black lacquer (cabinet). */
  blackLacquer: () =>
    once('blackLacquer', () => new THREE.MeshPhysicalMaterial({ color: 0x07080c, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })),
  drumSkin: () => once('drumSkin', () => new THREE.MeshStandardMaterial({ color: 0xe8dcc2, metalness: 0, roughness: 0.8 })),
  rubber: () => once('rubber', () => new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0, roughness: 0.9 })),
  /** Unlit HDR glow (blooms). */
  neon: (color: THREE.ColorRepresentation = PALETTE.cyan, intensity = 4) =>
    once(`neon-${new THREE.Color(color).getHexString()}-${intensity}`, () => new THREE.MeshBasicMaterial({ color: glow(color, intensity), toneMapped: false })),
  /** Additive soft glow (sprites, halos). */
  additive: (color: THREE.ColorRepresentation = PALETTE.cyan, opacity = 0.6) =>
    once(`add-${new THREE.Color(color).getHexString()}-${opacity}`, () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    ),
};

/** Soft radial gradient texture for glow sprites (cached). */
let radial: THREE.Texture | null = null;
export function radialTexture(): THREE.Texture {
  if (radial) return radial;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  radial = new THREE.CanvasTexture(c);
  radial.colorSpace = THREE.SRGBColorSpace;
  return radial;
}

/** Canvas texture helper (text/kanji decals, signs). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
