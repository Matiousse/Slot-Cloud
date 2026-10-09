// Gold multiplier coin of a Thunder Wild: thick beveled lathe disc with a
// milled rim, studs, an engraved dark face, an extruded "x25" and a glint.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PALETTE, canvasTexture, glow, radialTexture } from '../materials';
import { textGeometry, textSize } from '../text3d';

export const COIN_R = 0.43;
const FACE_Z = 0.03;

let shared: {
  body: THREE.BufferGeometry;
  studs: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
  bodyMat: THREE.Material;
  studMat: THREE.Material;
  faceMat: THREE.MeshStandardMaterial;
  numFace: THREE.MeshStandardMaterial;
  numSide: THREE.Material;
  ringMat: THREE.MeshBasicMaterial;
  glintMat: THREE.MeshBasicMaterial;
  backGlowMat: THREE.MeshBasicMaterial;
  quad: THREE.PlaneGeometry;
} | null = null;

function starTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g) => {
    const c = 64;
    const grad = g.createRadialGradient(c, c, 0, c, c, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, 'rgba(255,250,220,0.85)');
    grad.addColorStop(0.35, 'rgba(255,220,140,0.18)');
    grad.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'lighter';
    for (const [w, a] of [
      [5, 0],
      [3, Math.PI / 2],
      [1.6, Math.PI / 4],
      [1.6, -Math.PI / 4],
    ] as const) {
      g.save();
      g.translate(c, c);
      g.rotate(a);
      const lg = g.createLinearGradient(-64, 0, 64, 0);
      lg.addColorStop(0, 'rgba(255,240,200,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(-64, 0);
      g.lineTo(0, -w);
      g.lineTo(64, 0);
      g.lineTo(0, w);
      g.closePath();
      g.fill();
      g.restore();
    }
  });
}

function faceTextures() {
  const S = 512;
  const map = canvasTexture(S, S, (g) => {
    const c = S / 2;
    const bg = g.createRadialGradient(c, c * 0.8, 10, c, c, c);
    bg.addColorStop(0, '#2a1d0c');
    bg.addColorStop(0.55, '#140d06');
    bg.addColorStop(1, '#070504');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    // engraved sunburst
    g.save();
    g.translate(c, c);
    for (let i = 0; i < 48; i++) {
      g.rotate((Math.PI * 2) / 48);
      g.fillStyle = i % 2 ? 'rgba(255,190,80,0.10)' : 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-9, -c);
      g.lineTo(9, -c);
      g.closePath();
      g.fill();
    }
    g.restore();
    // inner rings
    g.strokeStyle = 'rgba(255,201,60,0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(c, c, c - 14, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,201,60,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c, c, c - 34, 0, Math.PI * 2);
    g.stroke();
    // tomoe-ish ticks
    g.save();
    g.translate(c, c);
    g.fillStyle = 'rgba(255,214,120,0.6)';
    for (let i = 0; i < 24; i++) {
      g.rotate((Math.PI * 2) / 24);
      g.fillRect(-2, -(c - 22), 4, 10);
    }
    g.restore();
    // vignette
    const v = g.createRadialGradient(c, c, c * 0.3, c, c, c);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, S, S);
  });
  const emissive = canvasTexture(S, S, (g) => {
    const c = S / 2;
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    g.shadowColor = '#fff';
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(c, c, c - 34, 0, Math.PI * 2);
    g.stroke();
    // faint centre glow behind the number
    const r = g.createRadialGradient(c, c, 0, c, c, c * 0.75);
    r.addColorStop(0, 'rgba(255,255,255,0.22)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
  });
  return { map, emissive };
}

function build() {
  if (shared) return shared;
  // lathe profile (r, h); h becomes +z (front) after rotateX
  const p: [number, number][] = [
    [0.0, -0.05],
    [0.3, -0.05],
    [0.372, -0.052],
    [0.405, -0.046],
    [0.424, -0.032],
    [0.43, -0.012],
    [0.43, 0.012],
    [0.424, 0.032],
    [0.405, 0.05],
    [0.378, 0.06],
    [0.35, 0.062],
    [0.328, 0.056],
    [0.316, 0.044],
    [0.312, FACE_Z],
  ];
  const body = new THREE.LatheGeometry(
    p.map(([r, h]) => new THREE.Vector2(r, h)),
    64,
  );
  body.rotateX(Math.PI / 2);
  // milled edge: ridges on the outer rim
  const pos = body.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y);
    if (r > 0.42 && Math.abs(z) < 0.02) {
      const a = Math.atan2(y, x);
      const k = 1 + 0.012 * Math.sign(Math.sin(a * 32));
      pos.setXY(i, x * k, y * k);
    }
  }
  body.computeVertexNormals();

  const studList: THREE.BufferGeometry[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const s = new THREE.SphereGeometry(0.016, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    s.rotateX(Math.PI / 2);
    s.translate(Math.cos(a) * 0.364, Math.sin(a) * 0.364, 0.058);
    studList.push(s);
  }
  const studs = mergeGeometries(studList)!;
  studList.forEach((g) => g.dispose());

  const face = new THREE.CircleGeometry(0.314, 64);
  face.translate(0, 0, FACE_Z);
  const ring = new THREE.RingGeometry(0.43, 0.6, 64);

  const tex = faceTextures();
  const bodyMat = (MAT.gold() as THREE.MeshStandardMaterial).clone();
  bodyMat.color.set(0xffc93c);
  bodyMat.roughness = 0.2;
  bodyMat.metalness = 1;
  bodyMat.envMapIntensity = 1.5;
  bodyMat.emissive = new THREE.Color(0x3a2200);
  const studMat = (MAT.gold() as THREE.MeshStandardMaterial).clone();
  studMat.color.set(0xffe08a);
  studMat.roughness = 0.12;
  studMat.emissive = new THREE.Color(0x2a1800);
  const faceMat = new THREE.MeshStandardMaterial({
    map: tex.map,
    emissiveMap: tex.emissive,
    emissive: glow(PALETTE.cyan, 1.6),
    metalness: 0.75,
    roughness: 0.4,
  });
  const numFace = new THREE.MeshStandardMaterial({ color: 0xffe7a3, metalness: 1, roughness: 0.18, emissive: glow(0xffb52e, 0.7) });
  const numSide = (MAT.goldDeep() as THREE.MeshStandardMaterial).clone();
  const ringMat = new THREE.MeshBasicMaterial({ color: glow(0xffd36b, 3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const glintMat = new THREE.MeshBasicMaterial({ map: starTexture(), color: glow(0xfff2c8, 2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const backGlowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: glow(0xffb52e, 1.4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  shared = { body, studs, face, ring, bodyMat, studMat, faceMat, numFace, numSide, ringMat, glintMat, backGlowMat, quad: new THREE.PlaneGeometry(1, 1) };
  return shared;
}

/** Pre-build text geometries of every multiplier the math can produce. */
export function warmCoinText(mults: number[]) {
  for (const m of mults) numberGeo(m);
  textGeometry('x', { size: 0.13, depth: 0.04, bevel: 0.008, bevelSegments: 2, curveSegments: 4 });
}

function numberGeo(m: number) {
  const s = String(m);
  const size = s.length >= 3 ? 0.19 : s.length === 2 ? 0.25 : 0.3;
  return textGeometry(s, { size, depth: 0.05, bevel: 0.01, bevelSegments: 2, curveSegments: 5 });
}

export class MultCoin {
  readonly group = new THREE.Group();
  /** Spinning part (body + face + number). */
  readonly spinner = new THREE.Group();
  private num: THREE.Mesh;
  private x: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private glint: THREE.Mesh;
  private glintMat: THREE.MeshBasicMaterial;
  private backGlow: THREE.Mesh;
  private ringT = 1;
  private glintT = 1;
  private nextGlint = 1500;
  mult = 0;

  constructor() {
    const s = build();
    const body = new THREE.Mesh(s.body, s.bodyMat);
    const studs = new THREE.Mesh(s.studs, s.studMat);
    const face = new THREE.Mesh(s.face, s.faceMat);
    this.num = new THREE.Mesh(numberGeo(2), [s.numFace, s.numSide]);
    this.x = new THREE.Mesh(textGeometry('x', { size: 0.13, depth: 0.04, bevel: 0.008, bevelSegments: 2, curveSegments: 4 }), [s.numFace, s.numSide]);
    this.spinner.add(body, studs, face, this.num, this.x);
    this.backGlow = new THREE.Mesh(s.quad, s.backGlowMat);
    this.backGlow.scale.setScalar(1.55);
    this.backGlow.position.z = -0.08;
    this.ringMat = s.ringMat.clone();
    this.ring = new THREE.Mesh(s.ring, this.ringMat);
    this.ring.position.z = 0.02;
    this.glintMat = s.glintMat.clone();
    this.glint = new THREE.Mesh(s.quad, this.glintMat);
    this.glint.position.set(-0.2, 0.22, 0.12);
    this.glint.scale.setScalar(0.5);
    this.group.add(this.backGlow, this.spinner, this.ring, this.glint);
    this.group.renderOrder = 6;
  }

  setMult(m: number) {
    if (m === this.mult) return;
    this.mult = m;
    this.num.geometry = numberGeo(m);
    const w = textSize(this.num.geometry).x;
    const xw = 0.1;
    const total = w + xw + 0.015;
    this.x.position.set(-total / 2 + xw / 2, -0.045, FACE_Z + 0.03);
    this.num.position.set(-total / 2 + xw + 0.015 + w / 2, 0, FACE_Z + 0.035);
  }

  /** Gold shockwave ring + glint when the coin settles. */
  settle() {
    this.ringT = 0;
    this.glintT = 0;
  }

  update(dt: number, t: number) {
    if (this.ringT < 1) {
      this.ringT = Math.min(1, this.ringT + dt / 420);
      const k = this.ringT;
      this.ring.scale.setScalar(1 + k * 1.3);
      this.ringMat.opacity = (1 - k) * (1 - k) * 0.9;
    } else this.ringMat.opacity = 0;
    this.nextGlint -= dt;
    if (this.nextGlint <= 0) {
      this.nextGlint = 2200 + ((t * 7.31) % 1800);
      this.glintT = 0;
    }
    if (this.glintT < 1) {
      this.glintT = Math.min(1, this.glintT + dt / 520);
      const k = this.glintT;
      const a = Math.sin(k * Math.PI);
      this.glintMat.opacity = a;
      this.glint.scale.setScalar(0.2 + a * 0.55);
      this.glint.rotation.z = k * 1.6;
    } else this.glintMat.opacity = 0;
    const bg = this.backGlow.material as THREE.MeshBasicMaterial;
    bg.opacity = 0.55 + 0.2 * Math.sin(t * 0.004);
  }
}
