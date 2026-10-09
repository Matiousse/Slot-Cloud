// Stage: WebGL renderer, camera framing, post-processing (bloom + cinematic
// grade: chromatic aberration, vignette, film grain, flash), update loop.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LayoutKind, SceneContext, Updatable } from './contracts';

export interface ScreenLayout {
  w: number;
  h: number;
  dpr: number;
  kind: LayoutKind;
  /** Board rect in CSS pixels (5x5 cells, cabinet excluded). */
  board: { x: number; y: number; size: number };
  barH: number;
  featH: number;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uVignette: { value: 1.05 },
    uGrain: { value: 0.055 },
    uAberration: { value: 0.0016 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uContrast: { value: 1.08 },
    uSaturation: { value: 1.1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFlash, uVignette, uGrain, uAberration, uContrast, uSaturation;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      // grade
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col *= uTint;
      // vignette
      col *= mix(1.0, smoothstep(0.85, 0.15, r2 * uVignette * 2.2), 0.85);
      // flash
      col += vec3(0.85, 0.93, 1.0) * uFlash;
      // grain
      float g = hash(vUv * 1024.0 + fract(uTime * 0.001) * 97.0) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  readonly ctx: SceneContext;
  layout!: ScreenLayout;
  time = 0;
  private updatables = new Set<Updatable>();
  private shakeAmp = 0;
  private shakeOffset = new THREE.Vector3();
  private baseCam = new THREE.Vector3();
  private layoutListeners: ((l: ScreenLayout) => void)[] = [];
  /** Lower internal resolution on weak devices. */
  quality = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.scene.background = new THREE.Color(0x04050c);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.ctx = { scene: this.scene, camera: this.camera, renderer: this.renderer, shake: (a) => this.shake(a) };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  add(u: Updatable & { object?: THREE.Object3D }) {
    this.updatables.add(u);
    if (u.object && !u.object.parent) this.scene.add(u.object);
  }

  remove(u: Updatable & { object?: THREE.Object3D }) {
    this.updatables.delete(u);
    u.object?.removeFromParent();
  }

  onLayout(fn: (l: ScreenLayout) => void) {
    this.layoutListeners.push(fn);
    if (this.layout) fn(this.layout);
  }

  shake(amount: number) {
    this.shakeAmp = Math.min(1.5, Math.max(this.shakeAmp, amount));
  }

  /** Full-screen white flash (0..1). */
  flash(amount: number) {
    this.grade.uniforms.uFlash.value = Math.max(this.grade.uniforms.uFlash.value, amount);
  }

  /** Screen position (CSS px) of a world point. */
  project(world: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const v = world.clone().project(this.camera);
    return out.set(((v.x + 1) / 2) * this.layout.w, ((1 - v.y) / 2) * this.layout.h);
  }

  computeLayout(w: number, h: number, dpr: number): ScreenLayout {
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const kind: LayoutKind = w / h < 0.9 ? 'portrait' : 'landscape';
    if (kind === 'portrait') {
      const barH = clamp(h * 0.24, 150, 230);
      const featH = clamp(h * 0.07, 44, 62);
      const size = Math.max(140, Math.min(w - 22, (h - barH - featH - 36) / 1.62));
      const bottom = h - barH - featH - 18;
      return { w, h, dpr, kind, board: { x: (w - size) / 2, y: bottom - size, size }, barH, featH };
    }
    const barH = clamp(h * 0.12, 58, 92);
    const size = Math.max(140, Math.min((h - barH) * 0.72, w * 0.44));
    const cx = w * 0.5 + Math.min(w * 0.07, size * 0.2);
    const bottom = h - barH - Math.max(14, (h - barH) * 0.07);
    return { w, h, dpr, kind, board: { x: cx - size / 2, y: bottom - size, size }, barH, featH: 0 };
  }

  resize() {
    const w = Math.max(240, window.innerWidth);
    const h = Math.max(160, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.quality;
    this.layout = this.computeLayout(w, h, dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.frameCamera();
    const b = this.layout.board;
    const root = document.documentElement.style;
    root.setProperty('--bx', b.x + 'px');
    root.setProperty('--by', b.y + 'px');
    root.setProperty('--bs', b.size + 'px');
    root.setProperty('--bar-h', this.layout.barH + 'px');
    root.setProperty('--feat-h', this.layout.featH + 'px');
    // marquee area (world y 2.95..3.85) for the free-spins HUD
    const unit = b.size / 5;
    root.setProperty('--logo-y', b.y - unit * 1.42 + 'px');
    root.setProperty('--logo-h', unit * 1.0 + 'px');
    document.body.classList.toggle('portrait', this.layout.kind === 'portrait');
    document.body.classList.toggle('landscape', this.layout.kind === 'landscape');
    this.layoutListeners.forEach((fn) => fn(this.layout));
  }

  /** Straight-on camera so that the 5-unit board spans `board.size` px at the requested spot. */
  private frameCamera() {
    const { w, h, board } = this.layout;
    const fov = this.camera.fov;
    const visibleH = (5 * h) / board.size;
    const dist = visibleH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    this.camera.aspect = w / h;
    this.baseCam.set(0, 0, dist);
    this.camera.position.copy(this.baseCam);
    this.camera.lookAt(0, 0, 0);
    const cx = board.x + board.size / 2;
    const cy = board.y + board.size / 2;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.near = Math.max(0.1, dist * 0.05);
    this.camera.far = dist + 300;
    this.camera.updateProjectionMatrix();
  }

  /** Advance the scene by `dt` ms (already clock-scaled) and render. */
  step(dt: number, dtReal = dt) {
    this.time += dt;
    for (const u of this.updatables) u.update(dt, this.time);
    // camera shake (decays in real time)
    this.shakeAmp = Math.max(0, this.shakeAmp - (dtReal / 1000) * 2.4);
    const a = this.shakeAmp * this.shakeAmp * 0.12;
    this.shakeOffset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
    this.camera.position.copy(this.baseCam).add(this.shakeOffset);
    const u = this.grade.uniforms;
    u.uTime.value = this.time;
    u.uFlash.value = Math.max(0, u.uFlash.value - (dtReal / 1000) * 3.2);
    this.composer.render(dtReal / 1000);
  }
}
