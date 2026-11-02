// Win presentation: glowing 3D line tubes with draw-on + travelling energy,
// beveled gold frames around winning cells, soft cell glows, and the single
// line amount label (crisp canvas texture).

import '@fontsource/orbitron/latin-900.css';
import * as THREE from 'three';
import { PAYLINES, REELS, ROWS, type LineWin } from '../../../shared/game';
import { ease } from '../../render/anim';
import { radialTexture } from '../materials';
import { roundedFrameGeometry, roundedRingFlat } from './shapes';

const LINE_Z = 0.42;
const FRAME_Z = 0.29;
const MAX_LINES = 20;
const LABEL_H = 0.46;
const LINE_COLORS = [0xffc93c, 0x38e8ff, 0xff3fae, 0x6dff8a, 0xff8a2a, 0xa98bff, 0xff4a5a, 0x4aa8ff];

const TUBE_VERT = /* glsl */ `
  uniform float uInflate;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec3 p = position + normal * uInflate;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const TUBE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDraw, uTime, uAlpha, uLen, uOutline;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float u = vUv.x;
    if (u > uDraw) discard;
    float nv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    if (uOutline > 0.5) {
      gl_FragColor = vec4(0.0, 0.0, 0.02, 0.72 * uAlpha * smoothstep(0.0, 0.35, nv));
      return;
    }
    float s = u * uLen;
    // travelling energy pulses
    float pulse = pow(0.5 + 0.5 * sin(s * 5.0 - uTime * 9.0), 10.0);
    float head = exp(-abs(uDraw - u) * uLen * 4.0) * step(uDraw, 0.999);
    vec3 core = vec3(1.0, 0.98, 0.94);
    // saturated colour body (kept around the bloom threshold) + thin hot core
    vec3 c = uColor * (0.32 + 0.38 * nv) + mix(uColor, core, 0.45) * pow(nv, 10.0) * 0.55;
    c += mix(uColor, core, 0.35) * pulse * 0.55;
    c += core * head * 1.6;
    gl_FragColor = vec4(c, uAlpha);
  }
`;

interface LineSlot {
  mesh: THREE.Mesh;
  outline: THREE.Mesh;
  u: Record<string, THREE.IUniform>;
  capA: THREE.Mesh;
  capB: THREE.Mesh;
  capMat: THREE.MeshBasicMaterial;
  delay: number;
  len: number;
}

const tubeCache = new Map<number, { geo: THREE.TubeGeometry; len: number; a: THREE.Vector3; b: THREE.Vector3 }>();

function lineTube(line: number) {
  let c = tubeCache.get(line);
  if (c) return c;
  const rows = PAYLINES[line];
  const pts: THREE.Vector3[] = [new THREE.Vector3(-2.66, 2 - rows[0], 0)];
  for (let r = 0; r < REELS; r++) pts.push(new THREE.Vector3(r - 2, 2 - rows[r], 0));
  pts.push(new THREE.Vector3(2.66, 2 - rows[REELS - 1], 0));
  // drop collinear points, then round the corners
  const clean: THREE.Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = clean[clean.length - 1], b = pts[i], n = pts[i + 1];
    const d1 = b.clone().sub(a).normalize(), d2 = n.clone().sub(b).normalize();
    if (d1.dot(d2) < 0.9999) clean.push(b);
  }
  clean.push(pts[pts.length - 1]);
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cur = clean[0].clone();
  for (let i = 1; i < clean.length; i++) {
    const p = clean[i];
    if (i < clean.length - 1) {
      const prev = clean[i - 1], next = clean[i + 1];
      const r = Math.min(0.24, p.distanceTo(prev) * 0.4, p.distanceTo(next) * 0.4);
      const inP = p.clone().add(prev.clone().sub(p).normalize().multiplyScalar(r));
      const outP = p.clone().add(next.clone().sub(p).normalize().multiplyScalar(r));
      path.add(new THREE.LineCurve3(cur, inP));
      path.add(new THREE.QuadraticBezierCurve3(inP, p.clone(), outP));
      cur = outP;
    } else path.add(new THREE.LineCurve3(cur, p.clone()));
  }
  const len = path.getLength();
  const geo = new THREE.TubeGeometry(path, Math.round(len * 34), 0.034, 8, false);
  c = { geo, len, a: clean[0].clone(), b: clean[clean.length - 1].clone() };
  tubeCache.set(line, c);
  return c;
}

export class WinFx {
  readonly group = new THREE.Group();
  private slots: LineSlot[] = [];
  private active = 0;
  private frames: THREE.Group[] = [];
  private frameMat: THREE.MeshStandardMaterial;
  private frameLineMat: THREE.ShaderMaterial;
  private frameLineU = { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0xfff0b0) } };
  private glows: THREE.Mesh[] = [];
  private glowMat: THREE.MeshBasicMaterial;
  private cellOn = new Uint8Array(REELS * ROWS);
  private frameDelay = new Float32Array(REELS * ROWS);
  private t = 0;
  private shown = false;
  private fade = 0;
  // label
  private label: THREE.Mesh;
  private labelMat: THREE.MeshBasicMaterial;
  private labelTex: THREE.CanvasTexture;
  private labelCanvas: HTMLCanvasElement;
  private labelText = '';
  private labelT = 0;
  private labelAspect = 4;
  private fontReady = false;

  constructor() {
    this.group.name = 'wins';
    // shared frame look
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.22, emissive: new THREE.Color(0xffa20a), emissiveIntensity: 1 });
    // inner neon line with two chaser lights running around the frame
    this.frameLineMat = new THREE.ShaderMaterial({
      uniforms: this.frameLineU,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAlpha;
        uniform vec3 uColor;
        varying vec2 vP;
        void main() {
          float a = atan(vP.y, vP.x);
          float c1 = pow(max(0.0, cos(a - uTime * 4.2)), 24.0);
          float c2 = pow(max(0.0, cos(a - uTime * 4.2 + 3.14159)), 24.0);
          vec3 col = uColor * (0.55 + (c1 + c2) * 2.6);
          gl_FragColor = vec4(col * uAlpha, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(0xffb52e).multiplyScalar(0.55), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const fg = roundedFrameGeometry(0.98, 0.98, 0.05, 0.14, 0.035, 0.014);
    const fl = roundedRingFlat(0.86, 0.86, 0.012, 0.1);
    const quad = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < REELS * ROWS; i++) {
      const reel = Math.floor(i / ROWS), row = i % ROWS;
      const g = new THREE.Group();
      const f = new THREE.Mesh(fg, this.frameMat);
      const l = new THREE.Mesh(fl, this.frameLineMat);
      l.position.z = 0.03;
      l.renderOrder = 5;
      g.add(f, l);
      g.position.set(reel - 2, 2 - row, FRAME_Z);
      g.visible = false;
      this.frames.push(g);
      const gl = new THREE.Mesh(quad, this.glowMat);
      gl.position.set(reel - 2, 2 - row, -0.32);
      gl.scale.setScalar(1.7);
      gl.visible = false;
      gl.renderOrder = 1;
      this.glows.push(gl);
      this.group.add(g, gl);
    }
    // line slots
    const capGeo = new THREE.OctahedronGeometry(0.075, 0);
    for (let i = 0; i < MAX_LINES; i++) {
      const u: Record<string, THREE.IUniform> = {
        uColor: { value: new THREE.Color() },
        uDraw: { value: 0 },
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uLen: { value: 6 },
        uOutline: { value: 0 },
        uInflate: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, transparent: true, depthWrite: false });
      const ou = { ...u, uOutline: { value: 1 }, uInflate: { value: 0.026 } };
      const omat = new THREE.ShaderMaterial({ uniforms: ou, vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(lineTube(0).geo, mat);
      const outline = new THREE.Mesh(lineTube(0).geo, omat);
      mesh.position.z = LINE_Z;
      outline.position.z = LINE_Z - 0.03;
      mesh.renderOrder = 7 + i * 0.01;
      outline.renderOrder = 6;
      mesh.visible = outline.visible = false;
      mesh.frustumCulled = outline.frustumCulled = false;
      const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(), toneMapped: false });
      const capA = new THREE.Mesh(capGeo, capMat);
      const capB = new THREE.Mesh(capGeo, capMat);
      capA.visible = capB.visible = false;
      capA.renderOrder = capB.renderOrder = 7;
      this.slots.push({ mesh, outline, u, capA, capB, capMat, delay: 0, len: 6 });
      this.group.add(outline, mesh, capA, capB);
    }
    // label
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 1024;
    this.labelCanvas.height = 256;
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.labelTex.anisotropy = 4;
    this.labelTex.generateMipmaps = true;
    this.labelTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.labelMat = new THREE.MeshBasicMaterial({ map: this.labelTex, color: new THREE.Color(1.05, 1.05, 1.05), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
    this.label = new THREE.Mesh(quad, this.labelMat);
    this.label.visible = false;
    this.label.renderOrder = 9;
    this.group.add(this.label);
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts
        .load('900 120px Orbitron')
        .then(() => {
          this.fontReady = true;
          if (this.labelText) this.drawLabel(this.labelText);
        })
        .catch(() => undefined);
    }
  }

  show(wins: LineWin[], withLines: boolean, label: string | undefined, coveredReel: (reel: number) => boolean) {
    this.t = 0;
    this.shown = true;
    this.cellOn.fill(0);
    for (const [line, , count] of wins)
      for (let r = 0; r < count; r++) {
        if (coveredReel(r)) continue;
        const i = r * ROWS + PAYLINES[line][r];
        this.cellOn[i] = 1;
        this.frameDelay[i] = r * 45;
      }
    this.active = withLines ? Math.min(MAX_LINES, wins.length) : 0;
    for (let i = 0; i < MAX_LINES; i++) {
      const s = this.slots[i];
      const on = i < this.active;
      s.mesh.visible = s.outline.visible = s.capA.visible = s.capB.visible = on;
      if (!on) continue;
      const tube = lineTube(wins[i][0]);
      s.mesh.geometry = s.outline.geometry = tube.geo;
      s.len = tube.len;
      s.u.uLen.value = tube.len;
      s.u.uDraw.value = 0;
      (s.u.uColor.value as THREE.Color).set(LINE_COLORS[i % LINE_COLORS.length]);
      s.capMat.color.set(LINE_COLORS[i % LINE_COLORS.length]).multiplyScalar(2.2);
      s.capA.position.set(tube.a.x, tube.a.y, LINE_Z);
      s.capB.position.set(tube.b.x, tube.b.y, LINE_Z);
      s.delay = i * 90;
    }
    if (label && wins.length === 1) {
      const [line, , count] = wins[0];
      const reel = count - 1;
      const row = PAYLINES[line][reel];
      this.drawLabel(label);
      const h = LABEL_H;
      const w = h * this.labelAspect;
      let x = reel - 2;
      x = Math.max(-2.45 + w / 2, Math.min(2.45 - w / 2, x));
      const y = 2 - row + (row >= 4 ? 0.37 : -0.37);
      this.label.position.set(x, y, LINE_Z + 0.08);
      this.label.scale.set(w, h, 1);
      this.label.visible = true;
      this.labelT = 0;
    } else {
      this.label.visible = false;
      this.labelText = '';
    }
  }

  hide() {
    this.shown = false;
  }

  warm(on: boolean) {
    if (this.shown || this.fade > 0.001) return;
    const f = this.frames[0], g = this.glows[0], s = this.slots[0];
    f.visible = g.visible = s.mesh.visible = s.outline.visible = s.capA.visible = this.label.visible = on;
    f.scale.setScalar(1e-4);
    g.scale.setScalar(1e-4);
    s.capA.scale.setScalar(on ? 1e-4 : 1);
    s.u.uDraw.value = -1;
    this.labelMat.opacity = 0;
  }

  private drawLabel(text: string) {
    this.labelText = text;
    const c = this.labelCanvas;
    const g = c.getContext('2d')!;
    const H = c.height;
    g.clearRect(0, 0, c.width, H);
    const font = `900 ${Math.round(H * 0.5)}px ${this.fontReady ? 'Orbitron' : '"Arial Black", Impact, sans-serif'}`;
    g.font = font;
    const tw = g.measureText(text).width;
    const padX = H * 0.38;
    const w = Math.min(c.width - 16, tw + padX * 2);
    const x0 = (c.width - w) / 2, y0 = H * 0.14, h = H * 0.72, r = h / 2;
    // pill
    g.save();
    g.beginPath();
    g.roundRect(x0, y0, w, h, r);
    const bg = g.createLinearGradient(0, y0, 0, y0 + h);
    bg.addColorStop(0, 'rgba(26,18,8,0.92)');
    bg.addColorStop(0.5, 'rgba(6,6,14,0.92)');
    bg.addColorStop(1, 'rgba(20,12,4,0.92)');
    g.fillStyle = bg;
    g.shadowColor = 'rgba(255,170,40,0.9)';
    g.shadowBlur = 18;
    g.fill();
    g.shadowBlur = 0;
    const br = g.createLinearGradient(0, y0, 0, y0 + h);
    br.addColorStop(0, '#fff2b8');
    br.addColorStop(0.45, '#ffc93c');
    br.addColorStop(1, '#a45c00');
    g.lineWidth = 7;
    g.strokeStyle = br;
    g.stroke();
    g.restore();
    // text
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font;
    const scale = Math.min(1, (w - padX * 1.4) / Math.max(1, tw));
    g.translate(c.width / 2, y0 + h / 2 + H * 0.02);
    g.scale(scale, 1);
    g.lineJoin = 'round';
    g.lineWidth = H * 0.07;
    g.strokeStyle = '#1a0d00';
    g.strokeText(text, 0, 0);
    const tg = g.createLinearGradient(0, -H * 0.22, 0, H * 0.22);
    tg.addColorStop(0, '#fff6cf');
    tg.addColorStop(0.42, '#ffe08a');
    tg.addColorStop(0.58, '#ffbf2e');
    tg.addColorStop(1, '#e88a10');
    g.shadowColor = 'rgba(255,170,40,0.75)';
    g.shadowBlur = 12;
    g.fillStyle = tg;
    g.fillText(text, 0, 0);
    g.restore();
    this.labelAspect = c.width / H;
    // crop aspect to the pill
    this.labelAspect = (w + 24) / H;
    const u0 = (x0 - 12) / c.width;
    this.labelTex.repeat.set((w + 24) / c.width, 1);
    this.labelTex.offset.set(u0, 0);
    this.labelTex.needsUpdate = true;
  }

  get visible() {
    return this.shown || this.fade > 0.001;
  }

  update(dt: number) {
    this.t += dt;
    const target = this.shown ? 1 : 0;
    this.fade += (target - this.fade) * Math.min(1, dt / (this.shown ? 60 : 110));
    if (!this.shown && this.fade < 0.01) {
      this.fade = 0;
      for (const f of this.frames) f.visible = false;
      for (const g of this.glows) g.visible = false;
      for (const s of this.slots) s.mesh.visible = s.outline.visible = s.capA.visible = s.capB.visible = false;
      this.label.visible = false;
      return;
    }
    const sec = this.t / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(sec * 7.5);
    this.frameMat.emissiveIntensity = (0.22 + pulse * 0.4) * this.fade;
    this.frameLineU.uAlpha.value = (0.6 + 0.4 * pulse) * this.fade;
    this.frameLineU.uTime.value = sec % 1000;
    this.glowMat.opacity = (0.16 + 0.1 * pulse) * this.fade;
    for (let i = 0; i < this.frames.length; i++) {
      const f = this.frames[i];
      const on = this.cellOn[i] === 1;
      f.visible = on;
      this.glows[i].visible = on;
      if (!on) continue;
      const k = Math.min(1, Math.max(0, (this.t - this.frameDelay[i]) / 240));
      const s = k <= 0 ? 0.001 : 0.6 + 0.4 * ease.outBack(k);
      f.scale.setScalar(s);
      this.glows[i].scale.setScalar(1.7 * s);
    }
    for (let i = 0; i < this.active; i++) {
      const s = this.slots[i];
      const k = Math.min(1, Math.max(0, (this.t - s.delay) / 420));
      s.u.uDraw.value = k <= 0 ? -1 : ease.outCubic(k);
      s.u.uTime.value = sec % 1000;
      s.u.uAlpha.value = this.fade * (this.label.visible ? 0.7 : 1);
      s.capB.visible = k >= 0.98;
      s.capA.visible = k > 0;
      s.capA.rotation.y = s.capB.rotation.y = sec * 2.4;
    }
    if (this.label.visible) {
      this.labelT += dt;
      const k = Math.min(1, this.labelT / 260);
      const s = ease.outBack(k);
      const h = LABEL_H;
      this.label.scale.set(h * this.labelAspect * s, h * s, 1);
      this.labelMat.opacity = Math.min(1, k * 2) * this.fade;
    }
  }
}
