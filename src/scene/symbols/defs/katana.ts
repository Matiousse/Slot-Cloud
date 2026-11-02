// H3 — Plasma Katana: curved plasma blade (dark spine -> white-hot edge, glowing
// hamon, flowing shimmer), gold habaki + four-lobed mokko tsuba with seppa,
// tsuka with crimson ito diamond wrap over samegawa, gold fuchi/kashira and
// menuki, a swaying crimson sageo tassel and a soft cyan aura. Diagonal pose.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Assets } from '../assets';
import { circlePath, extrude, lathe, merge, xf } from '../geo';
import { auraMaterial, bladeMaterial } from '../shaders';
import type { SymbolDef } from '../types';
import { grp, mk, speckle } from './util';

const BL = 0.8; // blade length (habaki -> tip)
const spine = (x: number) => 0.045 * (x / BL) * (x / BL); // sori (curvature)
const width = (x: number) => 0.074 - 0.016 * (x / BL);

function bladeGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const N = 40;
  const tipX = BL;
  const kissaki = 0.11;
  // spine (top) from base to tip start
  s.moveTo(0, spine(0));
  for (let i = 1; i <= N; i++) {
    const x = (i / N) * (tipX - 0.012);
    s.lineTo(x, spine(x));
  }
  // kissaki: tip point, then curve down to the edge
  s.lineTo(tipX, spine(tipX) - 0.012);
  const xe = tipX - kissaki;
  s.quadraticCurveTo(tipX - 0.02, spine(tipX) - width(tipX) * 1.05, xe, spine(xe) - width(xe));
  // edge back to base
  for (let i = N; i >= 0; i--) {
    const x = (i / N) * xe;
    s.lineTo(x, spine(x) - width(x));
  }
  s.lineTo(0, spine(0));
  const g = extrude(s, 0.006, 0.0085, 2, 16);
  // aBlade = (along, across): across 0 at spine -> 1 at cutting edge
  const p = g.attributes.position;
  const ab = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = Math.max(0, Math.min(BL, p.getX(i)));
    const y = p.getY(i);
    const across = (spine(x) - y) / Math.max(0.02, width(x));
    ab[i * 2] = x / BL;
    ab[i * 2 + 1] = Math.max(0, Math.min(1, across));
  }
  g.setAttribute('aBlade', new THREE.BufferAttribute(ab, 2));
  return g;
}

function mokko(r: number): THREE.Shape {
  // four-lobed tsuba outline
  const s = new THREE.Shape();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.9 + 0.1 * Math.pow(Math.abs(Math.cos(2 * a)), 0.6)) * (1 - 0.06 * Math.pow(Math.abs(Math.sin(2 * a)), 8));
    const x = Math.cos(a) * rr * 0.92, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  // hitsu-ana (cord holes) + nakago-ana
  s.holes.push(circlePath(0.018, -0.045, 0), circlePath(0.018, 0.045, 0));
  return s;
}

function wrapMaterial(a: Assets) {
  return a.once('mat-tsuka', () => {
    // u = around the handle, v = along it
    const tex = a.canvas('tsuka', 128, 512, (x) => {
      x.fillStyle = '#e3dccb';
      x.fillRect(0, 0, 128, 512);
      speckle(x, 128, 512, 2600, (r) => (r > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(120,110,95,0.5)'), 2.2, 3);
      const n = 6; // diamonds along the handle
      const h = 512 / n;
      for (let i = -1; i <= n; i++) {
        const y0 = i * h;
        for (const dir of [1, -1]) {
          x.save();
          x.beginPath();
          x.moveTo(0, y0 + (dir > 0 ? 0 : h));
          x.lineTo(128, y0 + (dir > 0 ? h : 0));
          x.lineWidth = 40;
          const g = x.createLinearGradient(0, y0, 0, y0 + h);
          g.addColorStop(0, '#5a020a');
          g.addColorStop(0.5, '#c3121f');
          g.addColorStop(1, '#5a020a');
          x.strokeStyle = '#9b0c18';
          x.stroke();
          x.lineWidth = 30;
          x.strokeStyle = '#c8202c';
          x.stroke();
          x.lineWidth = 4;
          x.strokeStyle = 'rgba(255,120,120,0.45)';
          x.stroke();
          x.restore();
        }
        // knot shadow at the crossing
        x.fillStyle = 'rgba(30,0,4,0.55)';
        x.fillRect(48, y0 + h / 2 - 3, 32, 6);
      }
      // silk twist lines
      x.strokeStyle = 'rgba(40,0,6,0.35)';
      x.lineWidth = 1;
      for (let y = 0; y < 512; y += 4) {
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(128, y + 3);
        x.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return a.lit(new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.55, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(0xff6060), envMap: a.envMap, envMapIntensity: 0.7 }),
    );
  });
}

export const H3: SymbolDef = {
  color: 0x38e8ff,
  backGlow: 0.22,
  sway: 0.12,
  bob: 0.012,
  glints: [
    [0.36, 0.37, 0.08],
    [-0.12, -0.12, 0.1],
    [0.1, 0.12, 0.06],
  ],
  build(a) {
    const root = grp('katana');
    const diag = grp('diag', [0.0, 0.0, 0], [0, 0, Math.PI / 4]);
    const sword = grp('sword', [-0.235, -0.03, 0], [0.18, -0.55, 0]);
    sword.scale.setScalar(1.2);
    diag.add(sword);
    root.add(diag);
    const gold = a.gold();

    // blade + aura
    sword.add(mk(a, bladeGeometry(), bladeMaterial(a), 'blade'));
    const aura = new THREE.PlaneGeometry(BL * 1.15, 0.24);
    aura.translate(BL * 0.52, 0.0, -0.02);
    sword.add(mk(a, aura, auraMaterial(a, 'katana', new THREE.Color(0.03, 0.22, 0.38)), 'aura'));

    // habaki (blade collar)
    const habaki = new RoundedBoxGeometry(0.04, 0.074, 0.03, 2, 0.008);
    habaki.translate(-0.012, -0.028, 0);
    // seppa washers + tsuba
    const seppa = new THREE.CylinderGeometry(0.046, 0.046, 0.006, 32);
    seppa.rotateZ(Math.PI / 2);
    const s1 = xf(seppa, [-0.036, -0.028, 0]);
    const s2 = xf(seppa, [-0.064, -0.028, 0]);
    seppa.dispose();
    const tsuba = extrude(mokko(0.112), 0.013, 0.006, 2, 8);
    tsuba.rotateY(Math.PI / 2);
    tsuba.translate(-0.05, -0.028, 0);
    // fuchi collar + kashira pommel
    const fuchi = lathe([[0, -0.088], [0.033, -0.088], [0.036, -0.082], [0.036, -0.07], [0.032, -0.066], [0, -0.066]], 32);
    fuchi.rotateZ(-Math.PI / 2);
    fuchi.translate(-0.003, -0.028, 0);
    const kashira = lathe([[0, -0.405], [0.022, -0.402], [0.033, -0.392], [0.034, -0.378], [0.03, -0.37], [0, -0.37]], 32);
    kashira.rotateZ(-Math.PI / 2);
    kashira.translate(-0.003, -0.028, 0);
    // menuki ornament (under the wrap)
    const menuki = new THREE.SphereGeometry(0.02, 12, 8);
    menuki.scale(1.8, 0.7, 0.6);
    menuki.translate(-0.22, -0.028, 0.027);
    sword.add(mk(a, merge([habaki, s1, s2, tsuba, fuchi, kashira, menuki]), gold, 'fittings'));

    // tsuka (handle) with ito wrap, slightly oval
    const tsuka = new THREE.CylinderGeometry(0.029, 0.031, 0.285, 28, 1, true);
    tsuka.rotateZ(Math.PI / 2);
    tsuka.scale(1, 1, 0.82);
    tsuka.translate(-0.232, -0.028, 0);
    sword.add(mk(a, tsuka, wrapMaterial(a), 'tsuka'));

    // sageo tassel hanging from the kashira (sways)
    const tassel = grp('tassel', [-0.405, -0.028, 0]);
    const cord = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.03, -0.04, 0.01), new THREE.Vector3(-0.02, -0.1, 0.015), new THREE.Vector3(0.0, -0.135, 0.01)]),
      16,
      0.007,
      6,
    );
    const tas = new THREE.CylinderGeometry(0.004, 0.018, 0.07, 10, 3);
    tas.translate(0.0, -0.17, 0.01);
    const knot = new THREE.SphereGeometry(0.013, 10, 8);
    knot.translate(0.0, -0.135, 0.01);
    tassel.add(mk(a, merge([cord, tas, knot]), a.crimson(), 'tassel-mesh'));
    sword.add(tassel);
    return root;
  },
  tick(v, _dt, t) {
    const tassel = v.nodes.get('tassel');
    if (tassel) {
      // undo the 45 deg of the sword so the cord hangs, then swing
      tassel.rotation.z = -Math.PI / 4 + 0.25 + Math.sin(t * 0.0024 + v.phase) * 0.18 + (v.state === 'win' ? Math.sin(v.stateT * 0.02) * 0.3 : 0);
    }
  },
};
