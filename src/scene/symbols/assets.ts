// Kit-level asset store for the reel symbols: owns every material / geometry /
// texture the kit creates (so clipping planes and dispose() reach all of them),
// a dedicated jewellery-studio reflection map, procedural textures, and the
// per-view material modulation used by the dim / win / trigger states.

import * as THREE from 'three';
import { MAT, PALETTE, glow } from '../materials';
import { textGeometry, type TextOptions } from '../text3d';
import { creased } from './geo';

/** How a material reacts to the per-view `dim` / `glow` modulation. */
interface ModInfo {
  kind: 'std' | 'basic' | 'shader';
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  envMapIntensity: number;
  opacity: number;
  /** Standard materials without emissive get a faint self-colour emissive when glowing (win). */
  warm: boolean;
  /** Uniform names that are per-material (cloned), every other uniform stays shared. */
  local: string[];
  /** Exponent applied to the boost for emissive response (flashier parts > 1). */
  pow: number;
}

const tmpC = new THREE.Color();

/** GLSL: scale punctual-light specular (base, clearcoat, sheen) by `k`. */
export const DAMP_GLSL = (k: string) =>
  `reflectedLight.directSpecular *= ${k}; clearcoatSpecularDirect *= ${k}; sheenSpecularDirect *= ${k};`;

/** GLSL: clamp the lit output so HalfFloat targets never overflow to Inf (bloom would smear it). */
export const CLAMP_GLSL = '#include <opaque_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(40.0));';

export class Assets {
  /** Shared animation time in seconds (written by every view update). */
  readonly time = { value: 0 };
  readonly envMap: THREE.Texture;
  planes: THREE.Plane[] = [];
  private mats = new Set<THREE.Material>();
  private owned = new Set<{ dispose(): void }>();
  private memo = new Map<string, unknown>();
  private info = new WeakMap<THREE.Material, ModInfo>();
  /** real-time fallback when nobody calls view.update() */
  lastUpdate = -1;

  constructor(readonly renderer: THREE.WebGLRenderer) {
    this.envMap = this.buildStudioEnv();
  }

  // ------------------------------------------------------------ registry

  /** Register a material (clipping + dispose + modulation info). */
  reg<T extends THREE.Material>(m: T, local: string[] = [], pow = 1): T {
    m.clippingPlanes = this.planes.length ? this.planes : null;
    this.mats.add(m);
    if (!this.info.has(m)) {
      const s = m as unknown as THREE.MeshStandardMaterial & THREE.ShaderMaterial & THREE.MeshBasicMaterial;
      const kind: ModInfo['kind'] = s.isShaderMaterial ? 'shader' : s.isMeshStandardMaterial ? 'std' : 'basic';
      this.info.set(m, {
        kind,
        color: s.color ? s.color.clone() : new THREE.Color(1, 1, 1),
        emissive: s.emissive ? s.emissive.clone() : new THREE.Color(0, 0, 0),
        emissiveIntensity: s.emissiveIntensity ?? 1,
        envMapIntensity: s.envMapIntensity ?? 1,
        opacity: m.opacity,
        warm: kind === 'std' && (!s.emissive || s.emissive.getHex() === 0) && !s.emissiveMap,
        local,
        pow,
      });
    }
    return m;
  }

  /** Register a lit (standard/physical) material with specular damping + HDR clamp. */
  lit<T extends THREE.MeshStandardMaterial>(m: T, dirSpec = 0.4, pow = 1): T {
    Assets.damp(m, dirSpec);
    return this.reg(m, [], pow);
  }

  /** Creased-normal copy of a text3d geometry (smooth bevels, crisp edges), owned by the kit. */
  text(t: string, o: TextOptions): THREE.BufferGeometry {
    return this.once(`text-${t}-${JSON.stringify(o)}`, () => this.own(creased(textGeometry(t, o).clone(), 0.62)));
  }

  own<T extends { dispose(): void }>(o: T): T {
    this.owned.add(o);
    return o;
  }

  once<T>(key: string, make: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, make());
    return this.memo.get(key) as T;
  }

  /** Per-view clone of a registered material (keeps shader injection + shared uniforms). */
  clone<T extends THREE.Material>(m: T): T {
    const src = this.info.get(m);
    const c = m.clone() as T;
    c.onBeforeCompile = m.onBeforeCompile;
    c.customProgramCacheKey = m.customProgramCacheKey;
    const sm = m as unknown as THREE.ShaderMaterial;
    const local = src?.local ?? [];
    if (sm.isShaderMaterial) {
      const cu = (c as unknown as THREE.ShaderMaterial).uniforms;
      for (const k of Object.keys(sm.uniforms)) {
        if (local.includes(k)) cu[k] = { value: cloneValue(sm.uniforms[k].value) };
        else cu[k] = sm.uniforms[k];
      }
    }
    // per-material uniforms injected via onBeforeCompile live in `uniformsLocal`
    const ul = (m as unknown as { uniformsLocal?: Record<string, THREE.IUniform> }).uniformsLocal;
    if (ul) {
      const copy: Record<string, THREE.IUniform> = {};
      for (const k of Object.keys(ul)) copy[k] = { value: cloneValue(ul[k].value) };
      (c as unknown as { uniformsLocal?: Record<string, THREE.IUniform> }).uniformsLocal = copy;
    }
    if (src) this.info.set(c, { ...src, color: src.color.clone(), emissive: src.emissive.clone() });
    return this.reg(c);
  }

  /**
   * Apply view modulation to a (cloned) material.
   * dim: 1 = normal, ~0.3 = dimmed.  boost: 1 = normal, >1 = win/trigger glow.
   */
  modulate(m: THREE.Material, dim: number, boost: number) {
    const i = this.info.get(m);
    if (!i) return;
    const lift = Math.max(0, boost - 1);
    const pb = i.pow === 1 ? boost : Math.pow(boost, i.pow);
    if (i.kind === 'std') {
      const s = m as THREE.MeshStandardMaterial;
      s.color.copy(i.color).multiplyScalar(dim * (1 + lift * 0.12));
      s.envMapIntensity = i.envMapIntensity * dim * (1 + lift * 0.35);
      if (i.warm) s.emissive.copy(i.color).multiplyScalar(lift * 0.16 * dim);
      else s.emissiveIntensity = i.emissiveIntensity * dim * dim * pb;
    } else if (i.kind === 'basic') {
      const b = m as THREE.MeshBasicMaterial;
      b.color.copy(i.color).multiplyScalar(dim * pb);
    } else {
      const u = (m as THREE.ShaderMaterial).uniforms.uIntensity;
      if (u) u.value = dim * dim * pb;
    }
    const ul = (m as unknown as { uniformsLocal?: Record<string, THREE.IUniform> }).uniformsLocal;
    if (ul?.uBoost) ul.uBoost.value = dim * dim * pb;
  }

  setClipping(planes: THREE.Plane[]) {
    this.planes = planes;
    for (const m of this.mats) m.clippingPlanes = planes.length ? planes : null;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    for (const o of this.owned) o.dispose();
    this.mats.clear();
    this.owned.clear();
    this.memo.clear();
    this.envMap.dispose();
  }

  // ------------------------------------------------------------ environment

  /**
   * Jewellery-studio reflection map: dark storm dome with a big cool key softbox,
   * a warm top strip, cyan / magenta neon rim strips and a few hot specks for
   * sparkle. Gives gold, chrome and gems rich, on-theme reflections regardless
   * of what the environment module puts in scene.environment.
   */
  private buildStudioEnv(): THREE.Texture {
    const s = new THREE.Scene();
    const dome = new THREE.SphereGeometry(20, 32, 16);
    const cols: number[] = [];
    const p = dome.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 20;
      tmpC.setRGB(0.012, 0.016, 0.04).lerp(new THREE.Color(0.05, 0.07, 0.16), Math.max(0, y));
      if (y < -0.1) tmpC.multiplyScalar(0.4);
      cols.push(tmpC.r, tmpC.g, tmpC.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    s.add(new THREE.Mesh(dome, domeMat));
    const panels: THREE.BufferGeometry[] = [];
    const panelMats: THREE.Material[] = [];
    const panel = (w: number, h: number, color: THREE.ColorRepresentation, k: number, pos: [number, number, number]) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.MeshBasicMaterial({ color: glow(color, k), side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...pos);
      mesh.lookAt(0, 0, 0);
      s.add(mesh);
      panels.push(g);
      panelMats.push(m);
    };
    panel(9, 5, 0xdfeaff, 2.4, [-7, 8, 9]); // key softbox
    panel(14, 1.6, 0xfff1d6, 1.6, [2, 12, 2]); // warm top strip
    panel(1.4, 12, PALETTE.cyan, 1.0, [11, 1, -3]); // cyan rim
    panel(1.2, 11, PALETTE.magenta, 0.75, [-11, 0, -4]); // magenta rim
    panel(16, 9, 0xfff2e0, 0.5, [0, 3, 16]); // big front diffuser (flat faces read as metal, not black)
    panel(10, 2.5, 0x6a7dff, 0.9, [0, -6, 10]); // low blue bounce
    panel(5, 3, 0xffffff, 1.3, [8, 4, 10]); // right front fill
    panel(0.8, 0.8, 0xffffff, 14, [-3, 6, 12]); // hot specks (sparkle)
    panel(0.6, 0.6, 0xffffff, 12, [5, 9, 8]);
    panel(0.5, 0.5, 0xcff8ff, 10, [9, -2, 9]);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const rt = pm.fromScene(s, 0.035);
    pm.dispose();
    dome.dispose();
    domeMat.dispose();
    panels.forEach((g) => g.dispose());
    panelMats.forEach((m) => m.dispose());
    return rt.texture;
  }

  // ------------------------------------------------------------ material library

  private std<T extends THREE.MeshStandardMaterial>(key: string, base: () => T, env: number, tweak?: (m: T) => void, dirSpec = 0.3): T {
    return this.once(key, () => {
      const m = base().clone() as T;
      m.envMap = this.envMap;
      m.envMapIntensity = env;
      tweak?.(m);
      Assets.damp(m, dirSpec);
      return this.reg(m);
    });
  }

  /**
   * Scale the punctual-light specular of a material. The shared rig's back rim
   * spots are tuned for the big character; on small polished symbols they blow
   * out into coloured bloom halos. Reflections come from the studio env instead.
   */
  static damp(m: THREE.MeshStandardMaterial, dirSpec: number) {
    const u = { value: dirSpec };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uDirSpec = u;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDirSpec;')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + DAMP_GLSL('uDirSpec'))
        .replace('#include <opaque_fragment>', CLAMP_GLSL);
    };
    m.customProgramCacheKey = () => 'sym-dirspec';
  }

  gold = () => this.std('gold', () => MAT.gold() as THREE.MeshStandardMaterial, 1.25, (m) => (m.roughness = 0.2));
  goldSatin = () => this.std('goldSatin', () => MAT.goldDeep() as THREE.MeshStandardMaterial, 1.35, (m) => (m.roughness = 0.32));
  chrome = () => this.std('chrome', () => MAT.chrome() as THREE.MeshStandardMaterial, 1.0, (m) => (m.roughness = 0.14));
  gunmetal = () => this.std('gunmetal', () => MAT.gunmetal() as THREE.MeshStandardMaterial, 1.1);
  blackSteel = () => this.std('blackSteel', () => MAT.blackSteel() as THREE.MeshStandardMaterial, 1.0);
  crimson = () => this.std('crimson', () => MAT.crimsonLacquer() as THREE.MeshPhysicalMaterial, 1.0, (m) => (m.color.set(0xa30f1b), (m.clearcoatRoughness = 0.14)));
  blackLacquer = () => this.std('blackLacquer', () => MAT.blackLacquer() as THREE.MeshPhysicalMaterial, 0.9, (m) => (m.clearcoatRoughness = 0.14));
  rubber = () => this.std('rubber', () => MAT.rubber() as THREE.MeshStandardMaterial, 0.5);

  /** Unlit HDR neon (bloom). */
  neon(color: THREE.ColorRepresentation, k: number): THREE.MeshBasicMaterial {
    return this.once(`neon-${new THREE.Color(color).getHexString()}-${k}`, () =>
      this.reg(new THREE.MeshBasicMaterial({ color: glow(color, k), toneMapped: false })),
    );
  }

  /** Additive soft sprite material (glows, flares). */
  additive(key: string, map: THREE.Texture, color: THREE.ColorRepresentation, k: number): THREE.MeshBasicMaterial {
    return this.once(`add-${key}-${new THREE.Color(color).getHexString()}-${k}`, () =>
      this.reg(
        new THREE.MeshBasicMaterial({
          map,
          color: glow(color, k),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        }),
      ),
    );
  }

  // ------------------------------------------------------------ textures

  canvas(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
    return this.once(`tex-${key}`, () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d')!);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      return this.own(t);
    });
  }

  /** Soft round glow. */
  softGlow = () =>
    this.canvas('soft', 128, 128, (x) => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.18, 'rgba(255,255,255,0.6)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    });

  /** 4+4 point star sparkle. */
  star = () =>
    this.canvas('star', 128, 128, (x) => {
      x.translate(64, 64);
      const ray = (len: number, w: number, a: number, alpha: number) => {
        x.save();
        x.rotate(a);
        const g = x.createLinearGradient(-len, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(-len, 0);
        x.quadraticCurveTo(0, -w, len, 0);
        x.quadraticCurveTo(0, w, -len, 0);
        x.fill();
        x.restore();
      };
      ray(62, 5, 0, 1);
      ray(62, 5, Math.PI / 2, 1);
      ray(34, 3, Math.PI / 4, 0.7);
      ray(34, 3, -Math.PI / 4, 0.7);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 22);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(-22, -22, 44, 44);
    });

  /** Thin bright ring (shockwave / win flare). */
  ring = () =>
    this.canvas('ring', 256, 256, (x) => {
      const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.62, 'rgba(255,255,255,0)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.86, 'rgba(255,255,255,1)');
      g.addColorStop(0.9, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
    });

  /** God-ray burst (rotates behind winning symbols). */
  rays = () =>
    this.canvas('rays', 256, 256, (x) => {
      x.translate(128, 128);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wide = i % 2 === 0 ? 0.13 : 0.07;
        const g = x.createRadialGradient(0, 0, 8, 0, 0, 128);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, 0);
        x.arc(0, 0, 128, a - wide, a + wide);
        x.closePath();
        x.fill();
      }
      const c = x.createRadialGradient(0, 0, 0, 0, 0, 128);
      c.addColorStop(0, 'rgba(255,255,255,0.0)');
      c.addColorStop(0.12, 'rgba(0,0,0,0.0)');
      x.globalCompositeOperation = 'destination-out';
      const fade = x.createRadialGradient(0, 0, 60, 0, 0, 128);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = fade;
      x.fillRect(-128, -128, 256, 256);
    });
}

function cloneValue<T>(v: T): T {
  const o = v as unknown as { clone?: () => T; isTexture?: boolean };
  if (o && typeof o === 'object' && typeof o.clone === 'function' && !o.isTexture) return o.clone();
  return v;
}
