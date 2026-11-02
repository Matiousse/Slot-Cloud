// Board-local effects: anticipation columns, scatter glows/rays, landing
// bursts (flash + ring), spin streak overlays and the reel-window shading.

import * as THREE from 'three';
import { REELS, ROWS } from '../../../shared/game';
import { PALETTE, canvasTexture, glow, radialTexture } from '../materials';
import { NOISE, VERT_LOCAL } from './glsl';

const quad = new THREE.PlaneGeometry(1, 1);
const ease = (k: number) => 1 - (1 - k) * (1 - k) * (1 - k);

// ------------------------------------------------------------ anticipation

const ANT_BACK = /* glsl */ `
  uniform float uTime, uK;
  uniform vec3 uA, uB, uC;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float x = vPos.x, y = vPos.y;
    float ax = abs(x) / 0.5;
    float n = bfbm(vec2(x * 3.2, y * 1.1 - uTime * 2.4));
    float flame = smoothstep(0.32, 0.85, n);
    vec3 col = mix(uA, uB, flame) * (0.25 + flame * 1.1);
    float st = pow(bn(vec2(x * 20.0, y * 0.45 - uTime * 5.0)), 7.0);
    col += uB * st * 2.4;
    col += uC * pow(ax, 6.0) * 1.2;
    col *= (0.55 + 0.45 * smoothstep(2.6, 1.4, abs(y))) * uK * 1.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const ANT_FRONT = /* glsl */ `
  uniform float uTime, uK;
  uniform vec3 uB, uC;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float x = vPos.x, y = vPos.y;
    float dx = abs(abs(x) - 0.5);
    float flick = 0.8 + 0.2 * bn(vec2(y * 6.0, uTime * 30.0));
    float beam = exp(-dx * 80.0) * 1.5 + exp(-dx * 18.0) * 0.2;
    float runner = pow(fract(y * 0.35 - uTime * 1.6), 14.0) + pow(fract(y * 0.35 - uTime * 1.6 + 0.5), 14.0);
    vec3 col = mix(uB, vec3(1.0, 0.97, 0.9), 0.3) * beam * flick + vec3(1.0, 0.95, 0.85) * runner * exp(-dx * 50.0) * 1.6;
    // chevrons rising in the middle of the reel
    float cy = fract((y - abs(x) * 0.6) * 1.1 - uTime * 1.4);
    float chev = smoothstep(0.0, 0.05, cy) * (1.0 - smoothstep(0.05, 0.12, cy)) * smoothstep(0.5, 0.2, abs(x));
    col += uB * chev * 0.2;
    col *= uK * smoothstep(2.7, 2.2, abs(y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Anticipation {
  readonly group = new THREE.Group();
  private back: THREE.Mesh[] = [];
  private front: THREE.Mesh[] = [];
  private u: Record<string, THREE.IUniform>[] = [];
  private k = new Float32Array(REELS);
  private target = new Uint8Array(REELS);
  private time = 0;

  constructor() {
    const geoBack = new THREE.PlaneGeometry(1.0, 5.0);
    const geoFront = new THREE.PlaneGeometry(1.24, 5.2);
    for (let r = 0; r < REELS; r++) {
      const u = {
        uTime: { value: 0 },
        uK: { value: 0 },
        uA: { value: new THREE.Color(PALETTE.crimson).multiplyScalar(1.3) },
        uB: { value: new THREE.Color(0xffb02e).multiplyScalar(1.4) },
        uC: { value: new THREE.Color(PALETTE.cyan).multiplyScalar(1.2) },
      };
      const mk = (frag: string) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT_LOCAL, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const b = new THREE.Mesh(geoBack, mk(ANT_BACK));
      b.position.set(r - 2, 0, -0.36);
      b.renderOrder = 1;
      const f = new THREE.Mesh(geoFront, mk(ANT_FRONT));
      f.position.set(r - 2, 0, 0.3);
      f.renderOrder = 5;
      b.visible = f.visible = false;
      this.back.push(b);
      this.front.push(f);
      this.u.push(u);
      this.group.add(b, f);
    }
  }

  set(reel: number, on: boolean) {
    this.target[reel] = on ? 1 : 0;
  }

  warm(on: boolean) {
    for (let r = 0; r < REELS; r++) if (this.k[r] <= 0.01) this.back[r].visible = this.front[r].visible = on;
  }

  update(dt: number) {
    this.time += dt;
    for (let r = 0; r < REELS; r++) {
      const k = (this.k[r] += (this.target[r] - this.k[r]) * Math.min(1, dt / (this.target[r] ? 140 : 220)));
      const vis = k > 0.01;
      this.back[r].visible = this.front[r].visible = vis;
      if (!vis) continue;
      const u = this.u[r];
      u.uTime.value = (this.time / 1000) % 600;
      u.uK.value = k * (0.85 + 0.15 * Math.sin(this.time / 70));
    }
  }
}

// ------------------------------------------------------------ scatter glows

function raysTexture(): THREE.Texture {
  return canvasTexture(256, 256, (g) => {
    const c = 128;
    g.translate(c, c);
    const rays = 18;
    for (let i = 0; i < rays; i++) {
      g.rotate((Math.PI * 2) / rays);
      const w = i % 2 ? 0.06 : 0.11;
      const grad = g.createLinearGradient(0, 0, 0, -c);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.tan(w) * -c, -c);
      g.lineTo(Math.tan(w) * c, -c);
      g.closePath();
      g.fill();
    }
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, c);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.3, 'rgba(255,255,255,0.4)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = rg;
    g.fillRect(-c, -c, 256, 256);
  });
}

export class ScatterGlows {
  readonly group = new THREE.Group();
  private glow: THREE.Mesh[] = [];
  private rays: THREE.Mesh[] = [];
  private k = new Float32Array(REELS * ROWS);
  private on = new Uint8Array(REELS * ROWS);
  private glowMat: THREE.MeshBasicMaterial;
  private raysMat: THREE.MeshBasicMaterial;
  private time = 0;
  /** extra intensity while the bonus is triggering */
  boost = 0;
  private boostK = 0;

  constructor() {
    this.glowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: glow(0xff3b30, 0.9), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.raysMat = new THREE.MeshBasicMaterial({ map: raysTexture(), color: glow(0xffc93c, 0.75), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < REELS * ROWS; i++) {
      const reel = Math.floor(i / ROWS), row = i % ROWS;
      const g = new THREE.Mesh(quad, this.glowMat);
      g.position.set(reel - 2, 2 - row, -0.34);
      g.renderOrder = 1;
      const r = new THREE.Mesh(quad, this.raysMat);
      r.position.set(reel - 2, 2 - row, -0.33);
      r.renderOrder = 1;
      g.visible = r.visible = false;
      this.glow.push(g);
      this.rays.push(r);
      this.group.add(g, r);
    }
  }

  set(reel: number, row: number, on: boolean) {
    this.on[reel * ROWS + row] = on ? 1 : 0;
  }

  clear() {
    this.on.fill(0);
  }

  warm(on: boolean) {
    const g = this.glow[0], r = this.rays[0];
    if (this.k[0] > 0.01) return;
    g.visible = r.visible = on;
    g.scale.setScalar(1e-4);
    r.scale.setScalar(1e-4);
  }

  isOn(reel: number, row: number) {
    return this.on[reel * ROWS + row] === 1;
  }

  update(dt: number) {
    this.time += dt;
    this.boostK += (this.boost - this.boostK) * Math.min(1, dt / 200);
    const sec = this.time / 1000;
    for (let i = 0; i < this.glow.length; i++) {
      const k = (this.k[i] += (this.on[i] - this.k[i]) * Math.min(1, dt / (this.on[i] ? 90 : 160)));
      const vis = k > 0.01;
      this.glow[i].visible = this.rays[i].visible = vis;
      if (!vis) continue;
      const p = 1 + 0.08 * Math.sin(sec * 6 + i);
      this.glow[i].scale.setScalar(1.7 * k * p * (1 + this.boostK * 0.15));
      this.rays[i].scale.setScalar(2.0 * k * (1 + this.boostK * 0.2));
      this.rays[i].rotation.z = sec * (0.5 + this.boostK * 1.2) + i;
    }
    this.raysMat.opacity = 0.5 + 0.2 * Math.sin(sec * 4) + this.boostK * 0.25;
    this.glowMat.opacity = 0.6 + this.boostK * 0.25;
  }
}

// ------------------------------------------------------------ bursts

interface Burst {
  flash: THREE.Mesh;
  ring: THREE.Mesh;
  fm: THREE.MeshBasicMaterial;
  rm: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  size: number;
}

export class Bursts {
  readonly group = new THREE.Group();
  private list: Burst[] = [];
  private next = 0;

  constructor(n = 10) {
    const ringGeo = new THREE.RingGeometry(0.47, 0.5, 64);
    for (let i = 0; i < n; i++) {
      const fm = new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const rm = new THREE.MeshBasicMaterial({ color: new THREE.Color(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const flash = new THREE.Mesh(quad, fm);
      const ring = new THREE.Mesh(ringGeo, rm);
      flash.renderOrder = ring.renderOrder = 8;
      flash.visible = ring.visible = false;
      this.list.push({ flash, ring, fm, rm, t: 1, dur: 400, size: 1 });
      this.group.add(flash, ring);
    }
  }

  warm(on: boolean) {
    const b = this.list[this.list.length - 1];
    if (b.t < 1) return;
    b.flash.visible = b.ring.visible = on;
    b.fm.opacity = b.rm.opacity = 0;
  }

  /** Flash (+ optional expanding ring; the stage's fx usually adds its own shockwave). */
  emit(x: number, y: number, z: number, color: THREE.ColorRepresentation, size = 1, dur = 420, ring = false) {
    const b = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    b.t = 0;
    b.dur = dur;
    b.size = size;
    b.flash.position.set(x, y, z);
    b.ring.position.set(x, y, z + 0.01);
    b.fm.color.set(color).multiplyScalar(1.2);
    b.rm.color.set(color).multiplyScalar(1.8);
    b.flash.visible = true;
    b.ring.visible = ring;
  }

  update(dt: number) {
    for (const b of this.list) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / b.dur);
      const k = b.t;
      const o = 1 - k;
      b.fm.opacity = o * o;
      b.flash.scale.setScalar(b.size * (1.2 + k * 1.4));
      b.rm.opacity = b.ring.visible ? o * o * 0.8 : 0;
      b.ring.scale.setScalar(b.size * (0.5 + ease(k) * 1.6));
      if (k >= 1) b.flash.visible = b.ring.visible = false;
    }
  }
}

// ------------------------------------------------------------ reel overlays

const OVERLAY_FRAG = /* glsl */ `
  uniform float uSpeed, uOff, uImpact, uImpactY, uTime;
  varying vec3 vPos;
  ${NOISE}
  void main() {
    float x = vPos.x, y = vPos.y;
    float yy = y + uOff;
    float sheen = bn(vec2(x * 3.0, yy * 0.25)) * (1.0 - smoothstep(0.3, 0.5, abs(x)));
    vec3 col = vec3(0.35, 0.6, 0.9) * sheen * uSpeed * 0.07;
    // stop impact: a bright band sweeping down + a short flash
    float band = exp(-abs(y - uImpactY) * 5.0) * uImpact;
    col += vec3(0.75, 0.95, 1.0) * band * 0.55;
    col += vec3(0.6, 0.85, 1.0) * uImpact * uImpact * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class ReelOverlays {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private u: Record<string, THREE.IUniform>[] = [];
  private impact = new Float32Array(REELS);

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 5);
    for (let r = 0; r < REELS; r++) {
      const u = { uSpeed: { value: 0 }, uOff: { value: 0 }, uImpact: { value: 0 }, uImpactY: { value: 3 }, uTime: { value: 0 } };
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT_LOCAL, fragmentShader: OVERLAY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.set(r - 2, 0, 0.27);
      m.renderOrder = 5;
      m.visible = false;
      this.meshes.push(m);
      this.u.push(u);
      this.group.add(m);
    }
  }

  warm(on: boolean) {
    const m = this.meshes[0];
    if (this.u[0].uSpeed.value > 0.01 || this.impact[0] > 0.01) return;
    m.visible = on;
  }

  stopImpact(reel: number) {
    this.impact[reel] = 1;
  }

  /** speed01: 0..1 normalized reel speed, offset: reel scroll (cells). */
  set(reel: number, speed01: number, offset: number, dt: number) {
    const u = this.u[reel];
    const imp = (this.impact[reel] = Math.max(0, this.impact[reel] - dt / 260));
    u.uSpeed.value = speed01;
    u.uOff.value = offset % 1000;
    u.uImpact.value = imp;
    u.uImpactY.value = 2.6 - (1 - imp) * 5.6;
    this.meshes[reel].visible = speed01 > 0.01 || imp > 0.01;
  }
}

// ------------------------------------------------------------ window shading

/** Soft inner shadow at the top/bottom of the reel window (symbols roll under the frame). */
export function windowShade(): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTexture(4, 128, (c) => {
    const grad = c.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(0,0,4,0.88)');
    grad.addColorStop(0.35, 'rgba(0,0,4,0.42)');
    grad.addColorStop(1, 'rgba(0,0,4,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 4, 128);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const top = new THREE.Mesh(quad, mat);
  top.scale.set(5, 0.42, 1);
  top.position.set(0, 2.5 - 0.21, 0.305);
  const bot = new THREE.Mesh(quad, mat);
  bot.scale.set(5, 0.42, 1);
  bot.rotation.z = Math.PI;
  bot.position.set(0, -2.5 + 0.21, 0.305);
  top.renderOrder = bot.renderOrder = 6;
  g.add(top, bot);
  return g;
}
