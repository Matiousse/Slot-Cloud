// H1 — Golden Kabuto: ribbed gold bowl (suji-bachi), flared neck guard with
// crimson silk lacing and gold edges, crimson-lacquer fukigaeshi with gold mon,
// a huge polished crescent maedate with a glowing cyan gem, a dark menpo with
// glowing eyes and red chin cords with tassels. The top symbol.

import * as THREE from 'three';
import type { Assets } from '../assets';
import { extrude, lathe, merge, mirrorX, xf } from '../geo';
import type { SymbolDef } from '../types';
import { grp, mk, prng } from './util';

const TAU = Math.PI * 2;

function silk(a: Assets) {
  return a.once('mat-silk', () =>
    a.lit(new THREE.MeshPhysicalMaterial({
        color: 0x8f0b16,
        roughness: 0.48,
        metalness: 0,
        sheen: 1,
        sheenColor: new THREE.Color(0xff5a5a),
        sheenRoughness: 0.35,
        envMap: a.envMap,
        envMapIntensity: 0.8,
      }),
    ),
  );
}

function lacing(a: Assets) {
  return a.once('mat-lacing', () => {
    const tex = a.canvas('lacing', 512, 64, (x) => {
      x.fillStyle = '#07070b';
      x.fillRect(0, 0, 512, 64);
      const n = 20;
      const w = 512 / n;
      for (let i = 0; i < n; i++) {
        const x0 = i * w + 3;
        const cw = w - 6;
        const g = x.createLinearGradient(x0, 0, x0 + cw, 0);
        g.addColorStop(0, '#3a0207');
        g.addColorStop(0.35, '#c4182a');
        g.addColorStop(0.55, '#e0303f');
        g.addColorStop(1, '#3a0207');
        x.fillStyle = g;
        x.fillRect(x0, 0, cw, 64);
        // silk twist
        x.strokeStyle = 'rgba(40,0,6,0.55)';
        x.lineWidth = 1.2;
        for (let y = -8; y < 64; y += 5) {
          x.beginPath();
          x.moveTo(x0, y);
          x.lineTo(x0 + cw, y + 6);
          x.stroke();
        }
      }
      // lacquer band with gold rivets at the top of each lame
      x.fillStyle = '#0b0b10';
      x.fillRect(0, 50, 512, 14);
      for (let i = 0; i < n; i++) {
        const cx = i * w + w / 2;
        const g = x.createRadialGradient(cx - 1, 55, 0, cx, 57, 4);
        g.addColorStop(0, '#fff3b0');
        g.addColorStop(0.5, '#e0a020');
        g.addColorStop(1, '#5a3a05');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, 57, 3.6, 0, TAU);
        x.fill();
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return a.lit(new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.42,
        metalness: 0.05,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        envMap: a.envMap,
        envMapIntensity: 0.9,
      }),
    );
  });
}

/** Crescent maedate (horns up) as a shape. */
function crescent(): THREE.Shape {
  const s = new THREE.Shape();
  const cA = 0.46, rA = 0.44;
  const cB = 0.575, rB = 0.475;
  // intersections
  const yi = (rA * rA - rB * rB + cB * cB - cA * cA) / (2 * (cB - cA));
  const xi = Math.sqrt(rA * rA - (yi - cA) * (yi - cA));
  const aA = Math.atan2(yi - cA, xi);
  const aB = Math.atan2(yi - cB, xi);
  s.moveTo(xi, yi);
  s.absarc(0, cA, rA, aA, -Math.PI - aA, true);
  s.absarc(0, cB, rB, -Math.PI - aB, aB, false);
  return s;
}

export const H1: SymbolDef = {
  color: 0xffc93c,
  backGlow: 0.32,
  sway: 0.16,
  bob: 0.014,
  glints: [
    [-0.4, 0.33, 0.2],
    [0.41, 0.32, 0.2],
    [0, 0.0, 0.22],
    [0.08, 0.2, 0.12],
    [-0.3, -0.12, 0.14],
  ],
  build(a) {
    const root = grp('kabuto');
    const helm = grp('helm', [0, -0.01, 0], [0, 0, 0]);
    helm.scale.set(1, 1, 0.6);
    root.add(helm);
    const gold = a.gold();
    const rnd = prng(11);

    // ---- bowl with raised ribs
    const bowl = new THREE.SphereGeometry(0.27, 72, 22, 0, TAU, 0, Math.PI * 0.5);
    {
      const p = bowl.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const r = v.length();
        const phi = Math.atan2(v.x, v.z);
        const polar = Math.acos(THREE.MathUtils.clamp(v.y / r, -1, 1));
        const rib = Math.pow(0.5 + 0.5 * Math.cos(phi * 24), 10);
        const k = 1 + 0.03 * rib * Math.pow(Math.sin(polar), 0.6);
        p.setXYZ(i, v.x * k, v.y * 0.92, v.z * k);
      }
      bowl.computeVertexNormals();
    }
    const bowlY = -0.03;
    // tehen ornament on top
    const tehen = merge([
      xf(new THREE.TorusGeometry(0.036, 0.011, 10, 32), [0, bowlY + 0.25, 0], [Math.PI / 2, 0, 0]),
      xf(new THREE.SphereGeometry(0.022, 16, 10), [0, bowlY + 0.262, 0]),
    ]);
    // brim (mabizashi), front 150 deg
    const brim = lathe(
      [
        [0.258, 0.016],
        [0.335, -0.05],
        [0.342, -0.064],
        [0.33, -0.068],
        [0.255, -0.004],
        [0.258, 0.016],
      ],
      40,
      -0.43 * Math.PI,
      0.86 * Math.PI,
    );
    brim.translate(0, bowlY, 0);
    // gold edge strips at the bottom of each lame (+ brim rim)
    const edges: THREE.BufferGeometry[] = [];
    const lames: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const y0 = bowlY - 0.03 - i * 0.066;
      const r0 = 0.268 + i * 0.042;
      const y1 = y0 - 0.074;
      const r1 = r0 + 0.085;
      for (const side of [1, -1]) {
        const start = side > 0 ? 0.34 * Math.PI : (2 - 0.34 - 0.5) * Math.PI;
        const len = 0.5 * Math.PI;
        const l = lathe(
          [
            [r0, y0],
            [r1, y1],
            [r1 - 0.004, y1 - 0.012],
            [r0 - 0.012, y0 - 0.006],
            [r0, y0],
          ],
          26,
          start,
          len,
        );
        lames.push(l);
        edges.push(
          lathe(
            [
              [r1 - 0.006, y1 + 0.008],
              [r1 + 0.01, y1 - 0.002],
              [r1 + 0.004, y1 - 0.018],
              [r1 - 0.01, y1 - 0.01],
              [r1 - 0.006, y1 + 0.008],
            ],
            26,
            start,
            len,
          ),
        );
      }
    }
    helm.add(mk(a, bowl, gold, 'bowl', [0, bowlY, 0]));
    helm.add(mk(a, merge([tehen, brim, ...edges]), gold, 'trim'));
    const lameMesh = mk(a, merge(lames), lacing(a), 'lames');
    helm.add(lameMesh);

    // ---- menpo (dark face) + glowing eyes
    const face = new THREE.SphereGeometry(0.2, 32, 18);
    face.scale(1.0, 0.82, 0.62);
    helm.add(mk(a, face, a.blackSteel(), 'menpo', [0, -0.15, 0.06]));
    const eye = new THREE.BoxGeometry(0.075, 0.017, 0.02);
    const eyes = merge([xf(eye, [-0.072, -0.11, 0.165], [0, 0.25, -0.28]), xf(eye.clone(), [0.072, -0.11, 0.165], [0, -0.25, 0.28])]);
    eye.dispose();
    helm.add(mk(a, eyes, a.neon(0x38e8ff, 4.5), 'eyes'));
    // gold moustache (menpo hige)
    const hige = new THREE.Shape();
    hige.moveTo(0, -0.012);
    hige.quadraticCurveTo(0.05, -0.03, 0.095, -0.012);
    hige.quadraticCurveTo(0.125, 0.0, 0.14, 0.03);
    hige.quadraticCurveTo(0.11, 0.012, 0.085, 0.008);
    hige.quadraticCurveTo(0.04, 0.002, 0, 0.012);
    hige.lineTo(-0.0, -0.012);
    const hR = extrude(hige, 0.01, 0.005, 2, 10);
    const hL = mirrorX(hR.clone());
    const higeG = merge([xf(hR, [0, -0.185, 0.14], [0, 0.35, 0]), xf(hL, [0, -0.185, 0.14], [0, -0.35, 0])]);
    helm.add(mk(a, higeG, a.goldSatin(), 'hige'));

    // ---- fukigaeshi (turn-backs): gold plate, crimson inset, gold mon
    const wing = (k: number) => {
      const w = new THREE.Shape();
      w.moveTo(0, -0.065 * k);
      w.lineTo(0, 0.06 * k);
      w.quadraticCurveTo(0.08 * k, 0.11 * k, 0.175 * k, 0.085 * k);
      w.quadraticCurveTo(0.215 * k, 0.0, 0.16 * k, -0.075 * k);
      w.quadraticCurveTo(0.07 * k, -0.095 * k, 0, -0.065 * k);
      return w;
    };
    const fGold: THREE.BufferGeometry[] = [];
    const fRed: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const o = new THREE.Object3D();
      o.position.set(s * 0.262, bowlY - 0.065, 0.12);
      o.rotation.set(0.05, s * -0.62, s * 0.1);
      o.updateMatrix();
      const gp = extrude(wing(1), 0.012, 0.007, 2, 10);
      if (s < 0) mirrorX(gp);
      gp.applyMatrix4(o.matrix);
      const rp = extrude(wing(0.74), 0.01, 0.004, 2, 10);
      rp.translate(0.03, 0.002, 0.012);
      if (s < 0) mirrorX(rp);
      rp.applyMatrix4(o.matrix);
      const mon = new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24);
      mon.rotateX(Math.PI / 2);
      mon.translate(s * 0.095, 0.004, 0.026);
      mon.applyMatrix4(o.matrix);
      const monRing = new THREE.TorusGeometry(0.032, 0.005, 8, 24);
      monRing.translate(s * 0.095, 0.004, 0.022);
      monRing.applyMatrix4(o.matrix);
      fGold.push(gp, mon, monRing);
      fRed.push(rp);
    }
    helm.add(mk(a, merge(fGold), gold, 'fuki-gold'));
    helm.add(mk(a, merge(fRed), a.crimson(), 'fuki-red'));

    // ---- crest (maedate) + mount + gem: kept at full depth (not z-squashed)
    const crest = grp('crest', [0, -0.035, 0.155], [-0.16, 0, 0]);
    const cres = extrude(crescent(), 0.02, 0.009, 3, 48);
    crest.add(mk(a, cres, gold, 'crescent'));
    const mountShape = new THREE.Shape();
    mountShape.moveTo(-0.07, -0.02);
    mountShape.lineTo(0.07, -0.02);
    mountShape.lineTo(0.055, 0.06);
    mountShape.quadraticCurveTo(0, 0.1, -0.055, 0.06);
    mountShape.lineTo(-0.07, -0.02);
    const mount = extrude(mountShape, 0.02, 0.008, 2, 10);
    mount.translate(0, 0.01, 0.02);
    const bezel = new THREE.TorusGeometry(0.036, 0.009, 10, 32);
    bezel.translate(0, 0.04, 0.045);
    crest.add(mk(a, merge([mount, bezel]), a.goldSatin(), 'mount'));
    const gem = new THREE.SphereGeometry(0.03, 24, 16);
    gem.scale(1, 1, 0.7);
    crest.add(mk(a, gem, a.neon(0x7ff6ff, 3.2), 'gem', [0, 0.04, 0.047]));
    root.add(crest);

    // ---- chin cords + knot + tassels (full depth, in front)
    const cords: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.25, -0.15, 0.05),
        new THREE.Vector3(s * 0.2, -0.27, 0.1),
        new THREE.Vector3(s * 0.09, -0.33, 0.13),
        new THREE.Vector3(s * 0.012, -0.345, 0.14),
      ]);
      cords.push(new THREE.TubeGeometry(c, 24, 0.012, 8, false));
    }
    cords.push(xf(new THREE.TorusGeometry(0.022, 0.012, 10, 20), [0, -0.345, 0.14], [0.3, 0, 0]));
    for (const s of [-1, 1]) {
      const tas = new THREE.CylinderGeometry(0.006, 0.026, 0.085, 12, 4);
      const p = tas.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (rnd() - 0.5) * 0.002);
      cords.push(xf(tas, [s * 0.022, -0.405, 0.135], [0, 0, s * 0.12]));
    }
    root.add(mk(a, merge(cords), silk(a), 'cords'));
    const capsG = merge([
      xf(new THREE.CylinderGeometry(0.011, 0.011, 0.014, 12), [-0.018, -0.366, 0.137], [0, 0, -0.12]),
      xf(new THREE.CylinderGeometry(0.011, 0.011, 0.014, 12), [0.018, -0.366, 0.137], [0, 0, 0.12]),
    ]);
    root.add(mk(a, capsG, gold, 'tassel-caps'));
    return root;
  },
};
