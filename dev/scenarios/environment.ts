// Environment preview scenario.
//   &s=environment                      real framing, steady ambient
//   &dbg=x,y,z,tx,ty,tz                 free debug camera (overrides the stage framing)
//   &strike=1                           force an ambient strike right away
// Exposes window.__env helpers for --plan eval: __env.cam(...), __env.strike(), __env.mode(m)
import type { Harness } from '../harness';

export default async (h: Harness) => {
  const params = new URLSearchParams(location.search);
  const stage = h.stage as unknown as { baseCam: import('three').Vector3; camera: import('three').PerspectiveCamera };
  const cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 30) => {
    stage.camera.clearViewOffset();
    stage.camera.fov = fov;
    stage.baseCam.set(x, y, z);
    stage.camera.position.set(x, y, z);
    stage.camera.lookAt(tx, ty, tz);
    stage.camera.far = 600;
    stage.camera.updateProjectionMatrix();
  };
  if (params.get('strike')) (h.env as unknown as { strikeNow?: (s: number) => void }).strikeNow?.(1);
  const dbg = params.get('dbg');
  if (dbg) {
    const v = dbg.split(',').map(Number);
    cam(v[0], v[1], v[2], v[3], v[4], v[5], v[6] || 30);
  }
  const env = h.env as unknown as { flash(s?: number): void; setMode(m: string, i?: boolean): void };
  (window as unknown as { __env: unknown }).__env = {
    cam,
    flash: (s = 1) => env.flash(s),
    strike: (s = 1) => (h.env as unknown as { strikeNow?: (s: number) => void }).strikeNow?.(s),
    mode: (m: string, instant = true) => h.setMode(m as never) ?? env.setMode(m, instant),
  };
};
