// Offscreen rendering of a symbol model:
//  - spin sprites: HDR render -> vertical motion blur -> HalfFloat texture (used
//    as a 1-draw-call billboard while reels spin);
//  - icons: HDR render -> mini bloom -> ACES + sRGB -> PNG data URL.
// The renderer state (render target, clear colour, clipping) is restored after use.

import * as THREE from 'three';
import { createLightRig } from '../lighting';

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BLUR_V = /* glsl */ `
uniform sampler2D tSrc;
uniform float uSpan;   // blur half-length in source uv
uniform float uScale;  // dst uv.y -> src uv.y scale (dst is taller)
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  float cy = (vUv.y - 0.5) * uScale + 0.5;
  for (int i = -14; i <= 14; i++) {
    float f = float(i) / 14.0;
    float w = 1.0 - abs(f) * 0.7;
    float y = cy + f * uSpan;
    vec4 s = (y < 0.0 || y > 1.0) ? vec4(0.0) : texture2D(tSrc, vec2(vUv.x, y));
    acc += s * w;
    wsum += w;
  }
  acc /= wsum;
  // keep a sharper copy in the middle so the symbol is still readable while spinning
  vec4 sharp = (cy < 0.0 || cy > 1.0) ? vec4(0.0) : texture2D(tSrc, vec2(vUv.x, cy));
  vec4 o = mix(acc, sharp, 0.22);
  gl_FragColor = vec4(o.rgb * uAlpha, o.a * uAlpha);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(0.7, 1.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const GAUSS = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSE = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c)); }
void main() {
  vec4 s = texture2D(tSrc, vUv);
  vec3 b = texture2D(tBloom, vUv).rgb * uBloom;
  vec3 hdr = s.rgb + b;
  float bl = dot(b, vec3(0.2126, 0.7152, 0.0722));
  float a = clamp(max(s.a, bl * 1.6), 0.0, 1.0);
  vec3 col = aces(hdr);
  // saturation / contrast like the stage grade
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(l), col, 1.12), 0.0, 1.0);
  vec3 straight = a > 0.001 ? clamp(col / a, 0.0, 1.0) : vec3(0.0);
  gl_FragColor = vec4(srgb(straight), a);
}`;

export interface BakeFrame {
  /** world size of the captured square around the origin */
  size: number;
  px: number;
}

export class Baker {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private mats: Record<'blur' | 'bright' | 'gauss' | 'compose', THREE.ShaderMaterial>;
  private rig = createLightRig();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 50);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.rig.group);
    this.rig.update(1000);
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.mats = {
      blur: mk(BLUR_V, { tSrc: { value: null }, uSpan: { value: 0.3 }, uScale: { value: 1.5 }, uAlpha: { value: 0.92 } }),
      bright: mk(BRIGHT, { tSrc: { value: null } }),
      gauss: mk(GAUSS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }),
      compose: mk(COMPOSE, { tSrc: { value: null }, tBloom: { value: null }, uBloom: { value: 0.9 }, uExposure: { value: 1.0 } }),
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.blur);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private withState<T>(fn: () => T): T {
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevClip = r.localClippingEnabled;
    const prevAuto = r.autoClear;
    try {
      r.localClippingEnabled = false;
      r.autoClear = true;
      r.setClearColor(0x000000, 0);
      return fn();
    } finally {
      r.setRenderTarget(prevRT);
      r.setClearColor(prevColor, prevAlpha);
      r.localClippingEnabled = prevClip;
      r.autoClear = prevAuto;
    }
  }

  private hdrTarget(w: number, h: number, msaa: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: msaa, depthBuffer: true });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  private renderModel(obj: THREE.Object3D, frame: BakeFrame, target: THREE.WebGLRenderTarget) {
    const h = frame.size / 2;
    this.camera.left = -h;
    this.camera.right = h;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
    const parent = obj.parent;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (parent) parent.add(obj);
    else this.scene.remove(obj);
  }

  /**
   * Motion-blurred billboard of `obj` (HDR, premultiplied). The returned texture
   * covers `frame.size` wide x `frame.size * stretch` tall world units.
   */
  spinSprite(obj: THREE.Object3D, frame: BakeFrame, stretch: number, blurWorld: number): THREE.WebGLRenderTarget {
    return this.withState(() => {
      const src = this.hdrTarget(frame.px, frame.px, 4);
      this.renderModel(obj, frame, src);
      const out = this.hdrTarget(frame.px, Math.round(frame.px * stretch), 0);
      const u = this.mats.blur.uniforms;
      u.tSrc.value = src.texture;
      u.uScale.value = stretch;
      u.uSpan.value = blurWorld / frame.size;
      this.pass(this.mats.blur, out);
      src.dispose();
      return out;
    });
  }

  /** PNG data URL of `obj` with bloom + ACES, transparent background. */
  icon(obj: THREE.Object3D, frame: BakeFrame): string {
    return this.withState(() => {
      const px = frame.px;
      const src = this.hdrTarget(px, px, 4);
      this.renderModel(obj, frame, src);
      const bw = Math.max(16, px >> 1);
      const a = this.hdrTarget(bw, bw, 0);
      const b = this.hdrTarget(bw, bw, 0);
      this.mats.bright.uniforms.tSrc.value = src.texture;
      this.pass(this.mats.bright, a);
      const g = this.mats.gauss.uniforms;
      for (let i = 0; i < 3; i++) {
        const spread = 1 + i * 1.5;
        g.tSrc.value = a.texture;
        g.uDir.value.set(spread / bw, 0);
        this.pass(this.mats.gauss, b);
        g.tSrc.value = b.texture;
        g.uDir.value.set(0, spread / bw);
        this.pass(this.mats.gauss, a);
      }
      const out = new THREE.WebGLRenderTarget(px, px, { type: THREE.UnsignedByteType, depthBuffer: false });
      const c = this.mats.compose.uniforms;
      c.tSrc.value = src.texture;
      c.tBloom.value = a.texture;
      this.pass(this.mats.compose, out);
      const buf = new Uint8Array(px * px * 4);
      this.renderer.readRenderTargetPixels(out, 0, 0, px, px, buf);
      src.dispose();
      a.dispose();
      b.dispose();
      out.dispose();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(px, px);
      for (let y = 0; y < px; y++) {
        const srcRow = (px - 1 - y) * px * 4;
        img.data.set(buf.subarray(srcRow, srcRow + px * 4), y * px * 4);
      }
      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL('image/png');
    });
  }

  dispose() {
    Object.values(this.mats).forEach((m) => m.dispose());
    this.quad.geometry.dispose();
    this.rig.group.traverse((o) => (o as THREE.Light).dispose?.());
  }
}
