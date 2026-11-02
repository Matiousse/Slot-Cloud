// WD — Wild: octagonal black-steel shield with glowing cyan engraved lightning
// sunburst, polished gold bevelled rim with corner rivets, a crimson lacquer
// swallow-tail banner with gold trims, and extruded WILD in gold with HDR
// glowing edges.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Assets } from '../assets';
import { extrude, merge, planarUV, polygon, polygonPath, xf } from '../geo';
import type { SymbolDef } from '../types';
import { boltShape } from './cell';
import { grp, mk, prng } from './util';

const TAU = Math.PI * 2;
const RO = 0.47; // rim outer circumradius
const RI = 0.405; // rim inner
const RP = 0.43; // plate

function plateMaterial(a: Assets) {
  return a.once('mat-wild-plate', () => {
    const draw = (glow: boolean) => (x: CanvasRenderingContext2D) => {
      const S = 512;
      x.fillStyle = glow ? '#000' : '#14161d';
      x.fillRect(0, 0, S, S);
      x.translate(S / 2, S / 2);
      if (!glow) {
        // brushed radial sheen
        const g = x.createRadialGradient(-60, -80, 10, 0, 0, 300);
        g.addColorStop(0, 'rgba(90,100,130,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(-S / 2, -S / 2, S, S);
      }
      // concentric octagon grooves
      x.strokeStyle = glow ? 'rgba(56,232,255,0.5)' : 'rgba(0,0,0,0.65)';
      x.lineWidth = 3;
      for (const r of [150, 190]) {
        x.beginPath();
        for (let i = 0; i <= 8; i++) {
          const ang = Math.PI / 8 + (i / 8) * TAU;
          const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
          if (i === 0) x.moveTo(px, py);
          else x.lineTo(px, py);
        }
        x.stroke();
      }
      // jagged lightning sunburst
      const rnd = prng(17);
      x.lineJoin = 'miter';
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * TAU + 0.1;
        x.beginPath();
        let r = 40;
        x.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        let jit = 0;
        while (r < 240) {
          r += 22 + rnd() * 18;
          jit = (rnd() - 0.5) * 0.16;
          x.lineTo(Math.cos(ang + jit) * r, Math.sin(ang + jit) * r);
        }
        x.lineWidth = glow ? (k % 2 ? 2.5 : 4) : k % 2 ? 4 : 6;
        x.strokeStyle = glow ? (k % 2 ? 'rgba(56,232,255,0.55)' : 'rgba(150,245,255,0.95)') : 'rgba(0,0,0,0.7)';
        x.stroke();
      }
      const c = x.createRadialGradient(0, 0, 0, 0, 0, 90);
      c.addColorStop(0, glow ? 'rgba(120,240,255,0.9)' : 'rgba(40,60,80,0.6)');
      c.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = c;
      x.fillRect(-100, -100, 200, 200);
    };
    const map = a.canvas('wild-plate', 512, 512, draw(false));
    const emap = a.canvas('wild-plate-glow', 512, 512, draw(true));
    const base = a.blackSteel();
    const m = base.clone();
    m.map = map;
    m.emissiveMap = emap;
    m.emissive = new THREE.Color(0x38e8ff);
    m.emissiveIntensity = 0.75;
    m.roughness = 0.35;
    m.onBeforeCompile = base.onBeforeCompile;
    m.customProgramCacheKey = base.customProgramCacheKey;
    return a.reg(m, [], 1.6);
  });
}

function bannerShape(w: number, h: number, notch: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2 - notch, 0);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(-w / 2, -h / 2);
  s.lineTo(-w / 2 + notch, 0);
  s.lineTo(-w / 2, h / 2);
  return s;
}

export const WD: SymbolDef = {
  color: 0xffc93c,
  backGlow: 0.3,
  sway: 0.17,
  bob: 0.012,
  glints: [
    [-0.3, 0.3, 0.12],
    [0.3, -0.3, 0.12],
    [0.22, 0.06, 0.15],
    [-0.25, -0.05, 0.15],
  ],
  build(a) {
    const root = grp('wild');
    const gold = a.gold();

    // shield plate (engraved, glowing grooves)
    const plate = extrude(polygon(8, RP, Math.PI / 8), 0.05, 0.014, 2, 4);
    planarUV(plate, -RP, -RP, RP * 2, RP * 2);
    root.add(mk(a, plate, plateMaterial(a), 'plate', [0, 0, -0.04]));

    // gold rim + rivets + top/bottom bolt emblems
    const rimShape = polygon(8, RO, Math.PI / 8);
    rimShape.holes.push(polygonPath(8, RI, Math.PI / 8));
    const rim = extrude(rimShape, 0.06, 0.016, 3, 4);
    rim.translate(0, 0, 0.0);
    const parts: THREE.BufferGeometry[] = [rim];
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI / 8 + (i / 8) * TAU;
      const r = (RO + RI) / 2;
      parts.push(xf(new THREE.SphereGeometry(0.019, 12, 8), [Math.cos(ang) * r, Math.sin(ang) * r, 0.045], [0, 0, 0], [1, 1, 0.7]));
    }
    for (const s of [1, -1]) {
      const b = extrude(boltShape(), 0.02, 0.008, 2, 4);
      b.scale(0.17, 0.17, 1);
      b.translate(0, s * 0.27, 0.01);
      parts.push(b);
    }
    root.add(mk(a, merge(parts), gold, 'rim'));

    // crimson banner with gold trims
    const banner = extrude(bannerShape(0.96, 0.25, 0.055), 0.03, 0.01, 2, 2);
    root.add(mk(a, banner, a.crimson(), 'banner', [0, 0, 0.055]));
    const trims = merge([
      xf(new RoundedBoxGeometry(0.86, 0.018, 0.02, 2, 0.006), [0, 0.11, 0.08]),
      xf(new RoundedBoxGeometry(0.86, 0.018, 0.02, 2, 0.006), [0, -0.11, 0.08]),
    ]);
    root.add(mk(a, trims, a.goldSatin(), 'trims'));

    // WILD: gold faces, glowing edges
    const txt = a.text('WILD', { font: 'display', size: 0.25, depth: 0.045, bevel: 0.011, bevelSegments: 3, curveSegments: 8 });
    const word = new THREE.Mesh(txt, [gold, a.neon(0xffa018, 1.15)]);
    word.name = 'word';
    word.scale.set(0.98, 1, 1);
    word.position.set(0, -0.003, 0.11);
    root.add(word);
    return root;
  },
};
