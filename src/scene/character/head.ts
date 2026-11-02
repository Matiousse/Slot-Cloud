// RAIJIN head: suji-bachi kabuto bowl, golden crescent maedate, crimson
// fukigaeshi, layered shikoro, black menpo with T-visor eyes, vents and a
// hinged fanged jaw guard. Head-local origin = neck pivot, face toward +Z.

import * as THREE from 'three';
import type { CharMats } from './mats';
import { M, Parts, bendX, chain, circlePoly, cyl, lathe, offsetPoly, plate, rivet, rounded, sphere, symPoly, torus, tube, type P2, type Poly } from './geo';
import { crescent, tomoePoly } from './shapes';
import { textGeometry } from '../text3d';

export interface HeadRig {
  head: THREE.Group;
  jaw: THREE.Group;
  /** local point between the eyes (for the eye glow sprite). */
  eyeCenter: THREE.Vector3;
  crestTips: THREE.Vector3[];
  meshes: THREE.Mesh[];
}

/** Plate with a gold rim plate behind it (the classic lacquer + gold edge look). */
export function rimmed(parts: Parts, outline: Poly, mat: THREE.Material | string, rimMat: THREE.Material | string, o: { depth: number; rim?: number; bevel?: number; deform?: (v: THREE.Vector3) => void; m?: THREE.Matrix4; holes?: Poly[]; seg?: number; grid?: number }) {
  const rim = o.rim ?? 0.035;
  parts.add(plate(outline, { depth: o.depth, bevel: o.bevel ?? Math.min(0.03, o.depth * 0.35), deform: o.deform, holes: o.holes, seg: o.seg, grid: o.grid }), mat, o.m);
  const rimDeform = o.deform;
  const rs = (o.seg ?? 0.07) * 1.3;
  parts.add(
    plate(offsetPoly(outline, rim), { depth: o.depth * 0.7, bevel: Math.min(0.02, o.depth * 0.3), bevelSegs: 1, noBack: true, seg: rs, grid: rimDeform ? rs * 2.5 : 0, deform: (v) => { v.z -= o.depth * 0.22; rimDeform?.(v); } }),
    rimMat,
    o.m,
  );
}

export function buildHead(mats: CharMats): HeadRig {
  const head = new THREE.Group();
  head.name = 'head';
  const P = new Parts();

  // ---------------------------------------------------------------- bowl (hachi)
  const bowlProfile: P2[] = [
    [0, 1.04], [0.14, 1.035], [0.28, 1.0], [0.4, 0.94], [0.5, 0.85], [0.57, 0.74], [0.61, 0.62], [0.62, 0.52], [0.6, 0.45], [0.0, 0.45],
  ];
  const bowl = lathe(bowlProfile, 54, 0.9);
  {
    // suji ridges + elongate front/back
    const p = bowl.attributes.position.array as Float32Array;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      const phi = Math.atan2(x, z);
      const ridge = Math.pow(0.5 + 0.5 * Math.cos(phi * 18), 6);
      const k = THREE.MathUtils.smoothstep(y, 0.5, 0.66) * (1 - THREE.MathUtils.smoothstep(y, 0.92, 1.02));
      const s = 1 + 0.028 * ridge * k;
      p[i] = x * s;
      p[i + 2] = z * s * 1.12 - 0.02;
    }
  }
  P.add(bowl, mats.armor);
  // gold koshimaki band round the bowl rim
  P.add(lathe([[0.6, 0.53], [0.645, 0.52], [0.66, 0.49], [0.645, 0.455], [0.6, 0.445]], 48, 0.7), mats.gold, M(0, 0, -0.02, 0, 0, 0, 1, 1, 1.12));
  // tehen ornament
  P.add(torus(0.07, 0.02, 8, 20), mats.gold, M(0, 1.04, -0.02, Math.PI / 2));
  P.add(sphere(0.05, 12, 8), mats.gold, M(0, 1.06, -0.02));
  // gold suji lines (front + sides)
  for (const a of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = 0.53 + t * 0.47;
      const r = 0.632 * Math.cos(Math.asin(Math.min(0.999, Math.max(0, (y - 0.5) / 0.56)))) + 0.006;
      pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * 1.12 - 0.02));
    }
    P.add(tube(pts, 0.014, 10, 5), mats.gold);
  }

  // ---------------------------------------------------------------- shikoro (neck guard lames)
  for (let i = 0; i < 4; i++) {
    const r0 = 0.6 + i * 0.07, y0 = 0.47 - i * 0.12;
    const r1 = 0.72 + i * 0.085, y1 = 0.31 - i * 0.12;
    const t = 0.04;
    const prof: P2[] = [[r0 - 0.01, y0 + 0.01], [r1, y1], [r1 + 0.012, y1 - t * 0.5], [r1 - 0.01, y1 - t], [r0 - t, y0 - 0.02], [r0 - t - 0.01, y0 + 0.01]];
    const lame = lathe(prof, 30, 0.9, 0.95, Math.PI * 2 - 1.9);
    lame.scale(1, 1, 1.1);
    P.add(lame, i === 0 ? mats.armor : mats.crimson, M(0, 0, -0.05));
    // gold bead on the lower edge
    const bead = lathe(circlePoly(r1 + 0.005, y1 - t * 0.5, 0.017, 5), 30, 1.2, 0.95, Math.PI * 2 - 1.9);
    bead.scale(1, 1, 1.1);
    P.add(bead, mats.gold, M(0, 0, -0.05));
    // rivets along the lame
    for (let k = 0; k < 6; k++) {
      const phi = 1.15 + (k / 5) * (Math.PI * 2 - 2.3);
      const rr = (r0 + r1) / 2 + 0.03;
      P.add(rivet(0.018), mats.goldDeep, M(Math.sin(phi) * rr, (y0 + y1) / 2, Math.cos(phi) * rr * 1.1 - 0.05, 0, phi, 0));
    }
  }

  // ---------------------------------------------------------------- brim (mabizashi)
  {
    const brim: Poly = rounded([[-0.66, 0.0, 0.05], [-0.62, 0.4, 0.12], [-0.3, 0.62, 0.12], [0, 0.68, 0.1], [0.3, 0.62, 0.12], [0.62, 0.4, 0.12], [0.66, 0.0, 0.05], [0, 0.12]], 0, 4);
    const m = M(0, 0.53, 0.0, Math.PI / 2 - 0.12, 0, 0);
    P.add(plate(brim, { depth: 0.045, bevel: 0.016, deform: (v) => { v.z -= 0.25 * v.y * v.y; } }), mats.armor, m);
    // gold leading edge
    const edge: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = -1.25 + (2.5 * i) / 16;
      edge.push(new THREE.Vector3(Math.sin(a) * 0.67, 0, Math.cos(a) * 0.62));
    }
    P.add(tube(edge, 0.018, 20, 5), mats.gold, M(0, 0.53 + 0.02, 0.06, -0.12, 0, 0));
  }

  // ---------------------------------------------------------------- menpo (face)
  const faceBend = chain(bendX(0.62));
  // base mask
  P.add(plate(symPoly([[0, 0.48], [0.44, 0.48, 0.05], [0.5, 0.3, 0.06], [0.38, 0.06, 0.08], [0.2, -0.06, 0.06], [0, -0.09]]), { depth: 0.2, bevel: 0.05, deform: faceBend }), mats.dark, M(0, 0, 0.36));
  // T visor (glow behind the armour)
  // dark visor recess, then the thin glowing T on top of it
  P.add(plate(rounded([[-0.42, 0.45], [0.42, 0.45], [0.4, 0.3], [0.08, 0.28], [0.07, 0.1], [-0.07, 0.1], [-0.08, 0.28], [-0.4, 0.3]], 0.02, 2), { depth: 0.02, bevel: 0.006, deform: faceBend }), mats.rubber, M(0, 0, 0.462));
  const tShape: Poly = rounded([[-0.38, 0.405], [-0.06, 0.37], [0.06, 0.37], [0.38, 0.405], [0.38, 0.38], [0.025, 0.343], [0.022, 0.15], [-0.022, 0.15], [-0.025, 0.343], [-0.38, 0.38]], 0.006, 2);
  P.add(plate(tShape, { depth: 0.02, bevel: 0.005, deform: faceBend }), mats.visor, M(0, 0, 0.47));
  // eyes: slanted, angry slits
  const eyeR: Poly = rounded([[0.07, 0.352], [0.34, 0.402], [0.345, 0.378], [0.085, 0.335]], 0.006, 2);
  const eyeL: Poly = eyeR.map(([x, y]) => [-x, y] as P2);
  for (const e of [eyeR, eyeL]) P.add(plate(e, { depth: 0.02, bevel: 0.005, deform: faceBend }), mats.eye, M(0, 0, 0.482));
  // brow armour (V shaped, menacing)
  const brow = symPoly([[0, 0.385], [0.12, 0.415, 0.01], [0.44, 0.455, 0.02], [0.52, 0.52, 0.02], [0.3, 0.56, 0.02], [0, 0.52]]);
  rimmed(P, brow, mats.armorLight, mats.gold, { depth: 0.09, rim: 0.022, deform: faceBend, m: M(0, 0, 0.51, 0.18, 0, 0) });
  // cheek guards with vents
  const cheek: Poly = rounded([[0.07, 0.3], [0.38, 0.32, 0.03], [0.5, 0.29, 0.03], [0.44, 0.08, 0.06], [0.24, -0.04, 0.05], [0.07, 0.08, 0.03]], 0, 3);
  const vents: Poly[] = [0, 1, 2].map((k) => rounded([[0.2, 0.235 - k * 0.07], [0.42, 0.25 - k * 0.075], [0.41, 0.225 - k * 0.075], [0.2, 0.21 - k * 0.07]], 0.008, 2));
  for (const s of [1, -1]) {
    const cs = s > 0 ? cheek : cheek.map(([x, y]) => [-x, y] as P2);
    const vs = s > 0 ? vents : vents.map((v) => v.map(([x, y]) => [-x, y] as P2));
    rimmed(P, cs, mats.armor, mats.gold, { depth: 0.08, rim: 0.02, deform: faceBend, m: M(0, 0, 0.49), holes: vs, seg: 0.05 });
    for (const v of vs) P.add(plate(v, { depth: 0.01, bevel: 0.003, deform: faceBend }), mats.lineDim, M(0, 0, 0.455));
  }
  // nose ridge between cheeks (dark steel bar over the T stem bottom)
  P.add(plate(symPoly([[0, 0.14], [0.06, 0.12, 0.01], [0.05, 0.02, 0.01], [0, 0.0]]), { depth: 0.06, bevel: 0.015, deform: faceBend }), mats.armorLight, M(0, 0, 0.5));
  // throat guard (yodare-kake), three hanging lames
  for (let i = 0; i < 3; i++) {
    const w = 0.34 + i * 0.05;
    const y = -0.04 - i * 0.12;
    const lame = symPoly([[0, y + 0.06], [w, y + 0.07, 0.03], [w + 0.03, y - 0.06, 0.03], [0, y - 0.09]]);
    rimmed(P, lame, mats.crimson, mats.gold, { depth: 0.05, rim: 0.02, deform: bendX(0.45), m: M(0, 0, 0.3 - i * 0.03, 0.25 + i * 0.08, 0, 0) });
  }

  // ---------------------------------------------------------------- fukigaeshi (side flaps)
  const flap: Poly = rounded([[0, 0], [0.34, -0.02, 0.05], [0.5, 0.18, 0.12], [0.46, 0.4, 0.08], [0.3, 0.46, 0.1], [0.16, 0.34, 0.04], [0.02, 0.3, 0.04]], 0, 4);
  for (const s of [1, -1]) {
    const f = s > 0 ? flap : flap.map(([x, y]) => [-x, y] as P2);
    const m = M(s * 0.5, 0.36, 0.3, -0.12, s * 0.95, s * -0.12, 1, 1, 1, 'YXZ');
    rimmed(P, f, mats.crimson, mats.gold, { depth: 0.06, rim: 0.035, deform: bendX(0.9), m });
    // gold mon (tomoe roundel)
    const mon = new THREE.Matrix4().multiplyMatrices(m, M(s * 0.3, 0.2, 0.045));
    P.add(cyl(0.085, 0.025, 20, 0.008), mats.gold, mon.clone().multiply(M(0, 0, 0, Math.PI / 2)));
    for (let k = 0; k < 3; k++)
      P.add(plate(tomoePoly(0.065, (k * Math.PI * 2) / 3, undefined, 7), { depth: 0.012, bevel: 0.004, bevelSegs: 1, noBack: true, seg: 0.05 }), mats.dark, mon.clone().multiply(M(0, 0, 0.016)));
  }

  // ---------------------------------------------------------------- ear modules + swept horns
  for (const s of [1, -1]) {
    P.add(cyl(0.16, 0.14, 24, 0.03), mats.armor, M(s * 0.6, 0.3, -0.02, 0, 0, Math.PI / 2));
    P.add(torus(0.11, 0.014, 6, 28), mats.line, M(s * 0.68, 0.3, -0.02, 0, Math.PI / 2, 0));
    P.add(cyl(0.07, 0.05, 16, 0.01), mats.gold, M(s * 0.69, 0.3, -0.02, 0, 0, Math.PI / 2));
    // horn fin sweeping back
    const fin: Poly = rounded([[0, -0.05], [0.12, -0.06], [0.62, 0.16], [0.72, 0.3, 0.0], [0.5, 0.2], [0.05, 0.1]], 0.02, 3);
    P.add(plate(fin, { depth: 0.04, bevel: 0.014 }), mats.armorLight, M(s * 0.66, 0.34, -0.12, 0, -Math.PI / 2 * s + (s > 0 ? Math.PI : 0), 0.0));
  }

  // ---------------------------------------------------------------- crest mount + crescent maedate
  {
    const mount = symPoly([[0, 0.17], [0.17, 0.15, 0.03], [0.22, 0.02, 0.04], [0.14, -0.12, 0.04], [0, -0.16]]);
    const mm = M(0, 0.66, 0.63, -0.32, 0, 0);
    rimmed(P, mount, mats.crimsonDark, mats.gold, { depth: 0.07, rim: 0.03, m: mm });
    // kanji disc
    const disc = new THREE.Matrix4().multiplyMatrices(mm, M(0, 0.01, 0.05));
    P.add(cyl(0.12, 0.035, 28, 0.01), mats.gold, disc.clone().multiply(M(0, 0, 0, Math.PI / 2)));
    P.add(cyl(0.1, 0.03, 28, 0.008), mats.crimsonDark, disc.clone().multiply(M(0, 0, 0.01, Math.PI / 2)));
    P.add(torus(0.1, 0.007, 4, 32), mats.lineDim, disc.clone().multiply(M(0, 0, 0.03)));
    const kanji = textGeometry('雷', { font: 'kanji', size: 0.13, depth: 0.014, bevel: 0.003, bevelSegments: 1, curveSegments: 3 });
    P.add(kanji, mats.crestGold, disc.clone().multiply(M(0, 0, 0.032)));

    const cr = crescent(1.42, 1.55, 0.33);
    const cm = M(0, 0.72, 0.6, -0.3, 0, 0);
    const crestBend = (v: THREE.Vector3) => { v.z -= 0.08 * v.y * v.y; };
    P.add(plate(cr.outline, { depth: 0.07, bevel: 0.026, bevelSegs: 2, seg: 0.07, deform: crestBend }), mats.crestGold, cm);
    // stepped inner blade (double-bevel look)
    const inner = offsetPoly(cr.outline, -0.07);
    P.add(plate(inner, { depth: 0.05, bevel: 0.02, bevelSegs: 2, seg: 0.07, noBack: true, deform: (v) => { v.z += 0.03; crestBend(v); } }), mats.goldDeep, cm);
  }

  // ---------------------------------------------------------------- jaw (hinged)
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, 0.16, 0.22);
  const J = new Parts();
  {
    const chin = symPoly([[0, 0.0], [0.22, -0.0, 0.02], [0.27, -0.08, 0.04], [0.2, -0.24, 0.05], [0.08, -0.31, 0.04], [0, -0.32]]);
    rimmed(J, chin, mats.armor, mats.gold, { depth: 0.1, rim: 0.022, deform: bendX(0.5), m: M(0, -0.03, 0.27) });
    // mouth glow slot behind fangs
    J.add(plate(symPoly([[0, 0.02], [0.2, 0.02, 0.01], [0.2, -0.04, 0.01], [0, -0.05]]), { depth: 0.02, bevel: 0.005, deform: bendX(0.5) }), mats.mouth, M(0, -0.02, 0.29));
    // teeth (chrome) and tusks (gold)
    const tooth: Poly = [[-0.025, 0], [0.025, 0], [0.004, 0.075], [-0.004, 0.075]];
    for (const x of [-0.13, -0.065, 0, 0.065, 0.13]) {
      const z = Math.cos(x / 0.5) * 0.5 - 0.5 + 0.335;
      J.add(plate(tooth, { depth: 0.025, bevel: 0.008, seg: 0.02 }), mats.chrome, M(Math.sin(x / 0.5) * 0.5, -0.04, z, 0, x / 0.5, 0));
    }
    const tusk: Poly = rounded([[-0.035, 0], [0.04, 0], [0.01, 0.2], [-0.02, 0.24, 0], [-0.025, 0.16]], 0.01, 2);
    for (const s of [1, -1]) {
      const tk = s > 0 ? tusk : tusk.map(([x, y]) => [-x, y] as P2);
      J.add(plate(tk, { depth: 0.04, bevel: 0.012, seg: 0.02 }), mats.gold, M(s * 0.215, -0.07, 0.28, -0.15, s * 0.5, s * -0.12));
    }
  }
  J.build(jaw, { name: 'jaw' });
  head.add(jaw);

  const meshes = P.build(head, { name: 'head' });
  return {
    head,
    jaw,
    eyeCenter: new THREE.Vector3(0, 0.37, 0.56),
    crestTips: [new THREE.Vector3(-1.5, 2.2, 0.15), new THREE.Vector3(1.5, 2.2, 0.15)],
    meshes,
  };
}
