// SC — Bonus Drum: Raijin's taiko. Bulging red-lacquer barrel with gold bands
// and gold-ring handles, black lacquer rims with two rows of gold byo studs,
// cream drumhead with a gold/black mitsudomoe that flashes on trigger, two
// crossed bachi sticks behind (they strike on trigger) and a BONUS gold plate.

import * as THREE from 'three';
import type { Assets } from '../assets';
import { extrude, lathe, merge, roundedRect, xf } from '../geo';
import type { SymbolDef } from '../types';
import { grp, mk, speckle } from './util';

const TAU = Math.PI * 2;
const HR = 0.285; // head radius
const HL = 0.15; // half length of the barrel

function tomoe(x: CanvasRenderingContext2D, cx: number, cy: number, R: number, fill: string) {
  // mitsudomoe: three commas = round head + a tail that hugs the outer circle
  // and tapers to a point
  const d = R * 0.42; // head centre distance
  const rh = R * 0.27; // head radius
  const R1 = d + rh; // outer edge radius
  const sweep = Math.PI * 0.64;
  x.fillStyle = fill;
  for (let k = 0; k < 3; k++) {
    const t0 = (k / 3) * TAU - Math.PI / 2;
    const hx = cx + Math.cos(t0) * d, hy = cy + Math.sin(t0) * d;
    x.beginPath();
    x.arc(hx, hy, rh, 0, TAU);
    x.fill();
    const tt = t0 + sweep;
    const ex = hx - Math.sin(t0) * rh, ey = hy + Math.cos(t0) * rh;
    const tm = t0 + sweep * 0.42;
    x.beginPath();
    x.moveTo(cx + Math.cos(t0) * R1, cy + Math.sin(t0) * R1);
    x.arc(cx, cy, R1, t0, tt, false);
    x.quadraticCurveTo(cx + Math.cos(tm) * R1 * 0.83, cy + Math.sin(tm) * R1 * 0.83, ex, ey);
    x.closePath();
    x.fill();
  }
}

function headMaterial(a: Assets) {
  return a.once('mat-drumhead', () => {
    const S = 512;
    const map = a.canvas('drumhead', S, S, (x) => {
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, '#f1e6cc');
      g.addColorStop(0.75, '#e1d1ae');
      g.addColorStop(0.92, '#b89d70');
      g.addColorStop(1, '#6d5434');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
      speckle(x, S, S, 3500, (r) => (r > 0.5 ? 'rgba(255,250,235,0.35)' : 'rgba(120,95,60,0.18)'), 3, 9);
      // outer ring band
      x.strokeStyle = '#1a1210';
      x.lineWidth = 16;
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.4, 0, TAU);
      x.stroke();
      x.strokeStyle = '#c99a2e';
      x.lineWidth = 5;
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.4, 0, TAU);
      x.stroke();
      // gold disc behind the tomoe
      const d = x.createRadialGradient(S / 2 - 30, S / 2 - 30, 10, S / 2, S / 2, S * 0.33);
      d.addColorStop(0, '#ffe7a0');
      d.addColorStop(0.6, '#e0a42a');
      d.addColorStop(1, '#8a5a10');
      x.fillStyle = d;
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.33, 0, TAU);
      x.fill();
      tomoe(x, S / 2, S / 2, S * 0.3, '#120c0a');
    });
    const emap = a.canvas('drumhead-glow', S, S, (x) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, S, S);
      x.strokeStyle = '#fff';
      x.lineWidth = 6;
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.4, 0, TAU);
      x.stroke();
      x.fillStyle = '#ffd36b';
      x.beginPath();
      x.arc(S / 2, S / 2, S * 0.33, 0, TAU);
      x.fill();
      tomoe(x, S / 2, S / 2, S * 0.3, '#000');
    });
    const m = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emap,
      emissive: new THREE.Color(1.0, 0.75, 0.3),
      emissiveIntensity: 0.12,
      roughness: 0.62,
      metalness: 0.05,
      envMap: a.envMap,
      envMapIntensity: 0.8,
    });
    return a.lit(m, 0.4, 2.6);
  });
}

function wood(a: Assets) {
  return a.once('mat-bachi', () =>
    a.lit(new THREE.MeshPhysicalMaterial({ color: 0x4a2412, roughness: 0.4, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.25, envMap: a.envMap, envMapIntensity: 0.9 })),
  );
}

export const SC: SymbolDef = {
  color: 0xff3b30,
  backGlow: 0.3,
  sway: 0.15,
  bob: 0.014,
  glints: [
    [-0.2, 0.22, 0.2],
    [0.24, 0.12, 0.2],
    [0.0, -0.3, 0.2],
  ],
  build(a) {
    const root = grp('drum');
    const gold = a.gold();

    // crossed bachi behind (each pivots at its grip end for the strike)
    for (const s of [-1, 1]) {
      const piv = grp(s < 0 ? 'bachiL' : 'bachiR', [s * 0.36, -0.3, -0.13], [0, 0, s * 0.825]);
      const shaft = lathe(
        [
          [0, -0.02],
          [0.02, -0.02],
          [0.022, 0.1],
          [0.018, 0.9],
          [0.024, 0.96],
          [0.0, 1.0],
        ],
        16,
      );
      piv.add(mk(a, shaft, wood(a), 'bachi-shaft'));
      piv.add(mk(a, merge([xf(new THREE.TorusGeometry(0.022, 0.006, 8, 16), [0, 0.06, 0], [Math.PI / 2, 0, 0]), xf(new THREE.TorusGeometry(0.019, 0.005, 8, 16), [0, 0.88, 0], [Math.PI / 2, 0, 0])]), gold, 'bachi-gold'));
      root.add(piv);
    }

    const drum = grp('drumBody', [0, 0.055, 0], [-0.32, 0.38, 0]);
    root.add(drum);
    const body = grp('body');
    body.rotation.x = Math.PI / 2; // lathe axis (y) -> z (head faces camera)
    drum.add(body);

    // barrel
    const prof: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const f = i / 16;
      const y = -HL + f * HL * 2;
      prof.push([HR + 0.02 + 0.05 * (1 - Math.pow((y / HL) * 1.0, 2)), y]);
    }
    body.add(mk(a, lathe(prof, 56), a.crimson(), 'barrel'));
    // black lacquer rims (skin folds over them)
    const rims = merge([
      lathe([[HR - 0.004, HL - 0.005], [HR + 0.03, HL - 0.012], [HR + 0.032, HL + 0.012], [HR - 0.004, HL + 0.012]], 56),
      lathe([[HR - 0.004, -HL - 0.012], [HR + 0.032, -HL - 0.012], [HR + 0.03, -HL + 0.012], [HR - 0.004, -HL + 0.005]], 56),
    ]);
    body.add(mk(a, rims, a.blackLacquer(), 'rims'));
    // gold: bands, studs, handles
    const g: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      g.push(xf(new THREE.TorusGeometry(HR + 0.052, 0.0075, 8, 64), [0, s * HL * 0.55, 0], [Math.PI / 2, 0, 0]));
      const n = 20;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        const r = HR + 0.034;
        const st = new THREE.SphereGeometry(0.015, 10, 6);
        g.push(xf(st, [Math.sin(ang) * r, s * (HL - 0.03), Math.cos(ang) * r]));
      }
    }
    for (const s of [1, -1]) {
      g.push(xf(new THREE.TorusGeometry(0.045, 0.01, 8, 24), [s * (HR + 0.1), 0, 0], [0, 0, 0]));
      g.push(xf(new THREE.CylinderGeometry(0.022, 0.026, 0.03, 12), [s * (HR + 0.07), 0, 0], [0, 0, Math.PI / 2]));
    }
    body.add(mk(a, merge(g), gold, 'drum-gold'));
    // drumheads
    const head = new THREE.CircleGeometry(HR + 0.002, 64);
    head.rotateX(-Math.PI / 2);
    head.translate(0, HL + 0.013, 0);
    // map so the tomoe is upright after body rotation (circle uv: x right, y up -> after rotX: uv.y along -z)
    const hm = mk(a, head, headMaterial(a), 'head');
    body.add(hm);
    const back = new THREE.CircleGeometry(HR + 0.002, 32);
    back.rotateX(Math.PI / 2);
    back.translate(0, -HL - 0.013, 0);
    body.add(mk(a, back, a.blackLacquer(), 'backhead'));

    // BONUS plate (stays upright, in front)
    const plate = grp('plate', [0, -0.335, 0.17]);
    plate.add(mk(a, extrude(roundedRect(0.82, 0.17, 0.05), 0.03, 0.012, 3, 8), a.blackLacquer(), 'plate-base'));
    const rimShape = roundedRect(0.86, 0.21, 0.07);
    rimShape.holes.push(roundedRect(0.8, 0.15, 0.045) as unknown as THREE.Path);
    plate.add(mk(a, extrude(rimShape, 0.036, 0.01, 3, 8), gold, 'plate-rim'));
    const word = new THREE.Mesh(a.text('BONUS', { font: 'display', size: 0.17, depth: 0.03, bevel: 0.008, bevelSegments: 2, curveSegments: 6 }), [gold, a.neon(0xffa018, 1.15)]);
    word.name = 'bonus';
    word.position.z = 0.03;
    word.scale.set(0.95, 1, 1);
    plate.add(word);
    root.add(plate);
    return root;
  },
  tick(v, _dt, _t) {
    const L = v.nodes.get('bachiL');
    const R = v.nodes.get('bachiR');
    let hit = 0;
    if (v.state === 'trigger') {
      const beat = (v.stateT % 720) / 720;
      // wind up (0.6..1) then strike at 0
      hit = beat > 0.62 ? Math.sin(((beat - 0.62) / 0.38) * Math.PI * 0.5) : Math.exp(-beat * 18) * 0.3 - 0.15 * Math.exp(-beat * 10);
    }
    if (L) L.rotation.z = -0.825 + hit * 0.4;
    if (R) R.rotation.z = 0.825 - hit * 0.4;
  },
};
