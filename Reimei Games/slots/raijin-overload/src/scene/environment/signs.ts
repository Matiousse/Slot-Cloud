// Neon signage: canvas-textured tube signs / lightboxes / holographic
// billboards (kanji + katakana + latin from the bundled fonts), steel backing
// boxes with brackets, light spill on the wall, buzzing flicker.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, canvasTexture, radialTexture } from '../materials';
import type { EnvUniforms } from './palette';
import { layoutText, measureText, type GlyphFont } from './glyphs';
import { bakeStatic } from './util';

export type SignStyle = 'tube' | 'box' | 'holo';

export interface SignSpec {
  text: string;
  font: GlyphFont;
  vertical?: boolean;
  style: SignStyle;
  color: number;
  /** Border tube / secondary colour. */
  color2?: number;
  w: number;
  h: number;
  pos: [number, number, number];
  intensity?: number;
  backing?: boolean;
  wallGlow?: boolean;
  /** 0 = steady, 1 = very glitchy. */
  flicker?: number;
  /** Pixels per world unit for the texture. */
  ppu?: number;
}

const css = (c: number, a = 1) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return `rgba(${r},${g},${b},${a})`;
};
const mixHex = (c: number, d: number, t: number) => {
  const r = ((c >> 16) & 255) * (1 - t) + ((d >> 16) & 255) * t;
  const g = ((c >> 8) & 255) * (1 - t) + ((d >> 8) & 255) * t;
  const b = (c & 255) * (1 - t) + (d & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

function roundRect(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function tube(ctx: CanvasRenderingContext2D, path: Path2D, color: number, lw: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(color, 0.22);
  ctx.lineWidth = lw * 3.2;
  ctx.stroke(path);
  ctx.strokeStyle = css(color, 0.95);
  ctx.lineWidth = lw;
  ctx.stroke(path);
  ctx.strokeStyle = css(mixHex(color, 0xffffff, 0.75), 1);
  ctx.lineWidth = lw * 0.38;
  ctx.stroke(path);
}

export function signTexture(s: SignSpec): THREE.CanvasTexture {
  const ppu = s.ppu ?? 96;
  const W = Math.min(1024, Math.max(32, Math.round((s.w * ppu) / 4) * 4));
  const H = Math.min(1024, Math.max(32, Math.round((s.h * ppu) / 4) * 4));
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const m = Math.min(W, H);
    const pad = m * 0.12;
    const n = [...s.text].length;
    let size: number;
    let x: number, y: number;
    if (s.vertical) {
      const per = s.font === 'kanji' ? 1.06 : 1.06;
      size = Math.min(W - pad * 2, (H - pad * 2) / (n * per));
      x = W / 2;
      y = (H - size * n * per) / 2 + size * 0.02;
    } else {
      size = Math.min(H - pad * 2.2, (W - pad * 2) / Math.max(1, measureText(s.text, s.font, 1)));
      const tw = measureText(s.text, s.font, size);
      x = (W - tw) / 2;
      y = H / 2 + size * (s.font === 'kanji' ? 0.36 : 0.37);
    }
    const runs = layoutText(s.text, s.font, size, x, y, !!s.vertical, s.vertical ? 0.06 : 0.08);
    const c2 = s.color2 ?? s.color;
    if (s.style === 'tube') {
      // border tube
      const border = new Path2D();
      roundRect(border, pad * 0.45, pad * 0.45, W - pad * 0.9, H - pad * 0.9, m * 0.08);
      tube(ctx, border, c2, m * 0.028);
      for (const r of runs) tube(ctx, r.path, s.color, size * (r.stroke ? 0.075 : 0.042));
    } else if (s.style === 'box') {
      // lightbox: faintly lit diffuser panel, bright glyphs, inner frame
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, css(c2, 0.2));
      g.addColorStop(1, css(c2, 0.1));
      ctx.fillStyle = g;
      ctx.beginPath();
      roundRect(ctx, pad * 0.3, pad * 0.3, W - pad * 0.6, H - pad * 0.6, m * 0.05);
      ctx.fill();
      ctx.strokeStyle = css(mixHex(c2, 0xffffff, 0.3), 0.8);
      ctx.lineWidth = m * 0.02;
      ctx.stroke();
      ctx.fillStyle = css(mixHex(s.color, 0xffffff, 0.35), 1);
      for (const r of runs) {
        if (r.stroke) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = size * 0.12;
          ctx.lineCap = 'round';
          ctx.stroke(r.path);
        } else ctx.fill(r.path);
      }
    } else {
      // holo billboard: gradient field, big glyph, scan grid baked lightly
      const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
      g.addColorStop(0, css(c2, 0.55));
      g.addColorStop(0.55, css(mixHex(c2, s.color, 0.5), 0.25));
      g.addColorStop(1, css(s.color, 0.45));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1);
      ctx.strokeStyle = css(mixHex(c2, 0xffffff, 0.5), 0.7);
      ctx.lineWidth = m * 0.025;
      ctx.strokeRect(m * 0.03, m * 0.03, W - m * 0.06, H - m * 0.06);
      ctx.fillStyle = css(mixHex(s.color, 0xffffff, 0.55), 1);
      for (const r of runs) {
        if (r.stroke) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = size * 0.12;
          ctx.lineCap = 'round';
          ctx.stroke(r.path);
        } else ctx.fill(r.path);
      }
    }
  });
}

const HOLO_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const HOLO_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uTime, uInt, uSeed, uFlash;
varying vec2 vUv;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  vec2 uv = vUv;
  float t = uTime + uSeed * 10.0;
  // occasional horizontal glitch slices
  float slice = floor(uv.y * 18.0);
  float gl = step(0.92, h11(slice + floor(t * 6.0))) * step(0.7, h11(floor(t * 1.3) + uSeed));
  uv.x += (h11(slice * 3.1 + floor(t * 12.0)) - 0.5) * 0.08 * gl;
  float ca = 0.004 + 0.01 * gl;
  vec3 c;
  c.r = texture2D(map, uv + vec2(ca, 0.0)).r;
  c.g = texture2D(map, uv).g;
  c.b = texture2D(map, uv - vec2(ca, 0.0)).b;
  float scan = 0.82 + 0.18 * sin(uv.y * 340.0 - t * 9.0);
  float roll = 0.85 + 0.15 * smoothstep(0.0, 0.08, abs(fract(uv.y * 0.5 - t * 0.12) - 0.5));
  float edge = smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x) * smoothstep(0.0, 0.02, uv.y) * smoothstep(1.0, 0.98, uv.y);
  gl_FragColor = vec4(c * scan * roll * edge * uInt * (1.0 + uFlash * 0.3), 1.0);
}`;

export interface Sign {
  spec: SignSpec;
  group: THREE.Group;
  /** World position of the sign face centre (for floor reflections). */
  world: THREE.Vector3;
  /** Current light level 0..1.x (flicker), for reflections. */
  level: number;
  /** Extra dimming (calm zone / layout). */
  dim: number;
}

export class SignSystem {
  readonly group = new THREE.Group();
  readonly signs: Sign[] = [];
  /** Static steel parts of every sign, merged once in finalize(). */
  private hardware = new THREE.Group();
  private faceMats: THREE.Material[] = [];
  private glowMats: (THREE.MeshBasicMaterial | null)[] = [];
  private timers: number[] = [];
  private bursts: number[] = [];
  private phases: number[] = [];
  private t = 0;
  private boxGeo = new Map<string, THREE.BufferGeometry>();

  constructor(private u: EnvUniforms) {
    this.group.name = 'signs';
  }

  add(spec: SignSpec): Sign {
    const g = new THREE.Group();
    g.position.set(...spec.pos);
    const tex = signTexture(spec);
    const intensity = spec.intensity ?? 3;
    let face: THREE.Material;
    if (spec.style === 'holo') {
      face = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, uTime: this.u.uTime, uInt: { value: intensity }, uSeed: { value: Math.random() }, uFlash: this.u.uFlash },
        vertexShader: HOLO_VERT,
        fragmentShader: HOLO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    } else {
      face = new THREE.MeshBasicMaterial({
        map: tex,
        color: new THREE.Color().setScalar(intensity),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
    }
    face.name = 'env-signFace';
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), face);
    plane.position.z = 0.02;
    plane.renderOrder = 2;
    g.add(plane);

    if (spec.backing !== false) {
      const key = `${spec.w.toFixed(2)}x${spec.h.toFixed(2)}`;
      let bg = this.boxGeo.get(key);
      if (!bg) {
        bg = new RoundedBoxGeometry(spec.w + 0.16, spec.h + 0.16, 0.22, 2, 0.06);
        this.boxGeo.set(key, bg);
      }
      const [px, py, pz] = spec.pos;
      const box = new THREE.Mesh(bg, MAT.blackSteel());
      box.position.set(px, py, pz - 0.13);
      this.hardware.add(box);
      // brackets to the wall
      const n = spec.vertical ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(BRACKET, MAT.gunmetal());
        if (spec.vertical) b.position.set(px, py + (i / (n - 1) - 0.5) * spec.h * 0.8, pz - 0.32);
        else b.position.set(px + (i / (n - 1) - 0.5) * spec.w * 0.8, py, pz - 0.32);
        this.hardware.add(b);
      }
    }
    let glowMat: THREE.MeshBasicMaterial | null = null;
    if (spec.wallGlow !== false) {
      glowMat = new THREE.MeshBasicMaterial({
        map: radialTexture(),
        color: new THREE.Color(spec.color).multiplyScalar(0.2),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      glowMat.name = 'env-signGlow';
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(spec.w * 3.2 + 2, spec.h * 1.9 + 2), glowMat);
      glow.position.z = -0.45;
      glow.renderOrder = 1;
      g.add(glow);
    }
    this.group.add(g);
    const sign: Sign = { spec, group: g, world: new THREE.Vector3(...spec.pos), level: 1, dim: 1 };
    this.signs.push(sign);
    this.faceMats.push(face);
    this.glowMats.push(glowMat);
    this.timers.push(1500 + Math.random() * 6000);
    this.bursts.push(0);
    this.phases.push(Math.random() * 100);
    return sign;
  }

  /** Merge all sign hardware into one draw call per material (call once after add()). */
  finalize() {
    this.group.add(bakeStatic(this.hardware));
  }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < this.signs.length; i++) {
      const s = this.signs[i];
      const fl = s.spec.flicker ?? 0.3;
      this.timers[i] -= dt;
      if (this.timers[i] <= 0) {
        this.bursts[i] = 120 + Math.random() * 520 * (0.4 + fl);
        this.timers[i] = (2500 + Math.random() * 9000) / (0.25 + fl);
      }
      let k = 0.93 + 0.05 * Math.sin(this.t * 0.0021 + this.phases[i]) + 0.02 * Math.sin(this.t * 0.061 + this.phases[i] * 3);
      if (this.bursts[i] > 0) {
        this.bursts[i] -= dt;
        // buzzing: hard drop-outs at mains-ish rate
        k *= Math.random() < 0.45 ? 0.08 + Math.random() * 0.25 : 1;
      }
      k *= s.dim;
      s.level = k;
      const intensity = s.spec.intensity ?? 3;
      const m = this.faceMats[i];
      if (m instanceof THREE.MeshBasicMaterial) m.color.setScalar(intensity * k);
      else (m as THREE.ShaderMaterial).uniforms.uInt.value = intensity * k;
      const gm = this.glowMats[i];
      if (gm) gm.opacity = Math.min(1, k);
    }
  }
}

const BRACKET = new RoundedBoxGeometry(0.16, 0.12, 0.44, 1, 0.03);
