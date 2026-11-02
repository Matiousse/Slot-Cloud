// Close-up camera for the character module (overrides the stage framing).
// URL: &s=character_cam&cx=..&cy=..&cz=..&tx=..&ty=..&tz=..&fov=..
import type { Harness } from '../harness';

export default async (h: Harness) => {
  const q = new URLSearchParams(location.search);
  const n = (k: string, d: number) => (q.has(k) ? +q.get(k)! : d);
  const cam = h.stage.camera;
  const pos = new h.THREE.Vector3(n('cx', 0), n('cy', 4), n('cz', 9));
  const tgt = new h.THREE.Vector3(n('tx', 0), n('ty', 3.5), n('tz', -2));
  cam.clearViewOffset();
  cam.fov = n('fov', 30);
  cam.updateProjectionMatrix();
  (h.stage as unknown as { baseCam: { copy(v: unknown): void } }).baseCam.copy(pos);
  cam.position.copy(pos);
  cam.lookAt(tgt);
  if (q.get('solo') === '1') for (const o of [h.board.object, h.cabinet.object, h.fx.object]) o.visible = false;
  (window as unknown as { __cam: unknown }).__cam = { pos, tgt };
};
