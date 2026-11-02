// Debug: render each symbol into a HalfFloat target over time and report any
// NaN/Inf pixels (they turn the whole bloomed frame black). Logs via console.error.
//   ?manual=1&use=symbols&s=symbols_nan
import type { Harness } from '../harness';
import { SYMBOLS } from '../../shared/game';
import type { SymbolState } from '../../src/scene/contracts';

export default async (h: Harness) => {
  const THREE = h.THREE;
  const r = h.stage.renderer;
  h.board.object.visible = false;
  const rt = new THREE.WebGLRenderTarget(96, 96, { type: THREE.HalfFloatType });
  const buf = new Uint16Array(96 * 96 * 4);
  const scene = h.stage.scene;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 2.4);
  const states = (new URLSearchParams(location.search).get('states') ?? 'idle').split(',') as SymbolState[];
  const report: string[] = [];
  for (const code of SYMBOLS) {
    for (const st of states) {
      const v = h.kit.create(code);
      scene.add(v.object);
      v.setState(st);
      let bad = 0, first = -1;
      const meshes: string[] = [];
      for (let f = 0; f < 24; f++) {
        const t = 1000 + f * 157;
        v.update(157, t);
        r.setRenderTarget(rt);
        r.render(scene, cam);
        r.readRenderTargetPixels(rt, 0, 0, 96, 96, buf);
        let n = 0;
        for (let i = 0; i < buf.length; i++) if ((buf[i] & 0x7c00) === 0x7c00) n++;
        if (n) {
          bad++;
          if (first < 0) {
            first = t;
            // find the culprit mesh
            v.object.traverse((o) => {
              const m = o as import('three').Mesh;
              if (!m.isMesh || !m.visible) return;
              const vis = new Map<import('three').Object3D, boolean>();
              v.object.traverse((x) => {
                vis.set(x, x.visible);
                if ((x as import('three').Mesh).isMesh) x.visible = x === m;
              });
              let p = m.parent;
              while (p) {
                p.visible = true;
                p = p.parent;
              }
              r.render(scene, cam);
              r.readRenderTargetPixels(rt, 0, 0, 96, 96, buf);
              let k = 0;
              for (let i = 0; i < buf.length; i++) if ((buf[i] & 0x7c00) === 0x7c00) k++;
              if (k) meshes.push(`${m.name || '(unnamed)'}:${k}`);
              vis.forEach((val, x) => (x.visible = val));
            });
          }
        }
      }
      r.setRenderTarget(null);
      scene.remove(v.object);
      report.push(`${code}/${st}: ${bad ? `NaN frames ${bad}/24 first t=${first} meshes ${meshes.join(',')}` : 'ok'}`);
    }
  }
  console.error(report.join('\n'));
  (window as unknown as { __nanDone: boolean }).__nanDone = true;
};
