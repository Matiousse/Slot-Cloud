// Small procedural geometry helpers for the board.

import * as THREE from 'three';

function roundedRectPath(path: THREE.Path, w: number, h: number, r: number, cw: boolean) {
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  if (!cw) {
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h - r);
    path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
  } else {
    path.moveTo(x + r, y);
    path.quadraticCurveTo(x, y, x, y + r);
    path.lineTo(x, y + h - r);
    path.quadraticCurveTo(x, y + h, x + r, y + h);
    path.lineTo(x + w - r, y + h);
    path.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    path.lineTo(x + w, y + r);
    path.quadraticCurveTo(x + w, y, x + w - r, y);
    path.lineTo(x + r, y);
  }
}

/** Beveled rounded-square frame (outer size `w`x`h`, border `b`), centered, front at z = depth/2 + bevel. */
export function roundedFrameGeometry(w: number, h: number, b: number, r: number, depth: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  roundedRectPath(shape, w, h, r, false);
  const hole = new THREE.Path();
  roundedRectPath(hole, w - b * 2, h - b * 2, Math.max(0.01, r - b * 0.8), true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 2,
    curveSegments: 5,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Flat rounded-rect ring (for additive neon lines). */
export function roundedRingFlat(w: number, h: number, b: number, r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  roundedRectPath(shape, w, h, r, false);
  const hole = new THREE.Path();
  roundedRectPath(hole, w - b * 2, h - b * 2, Math.max(0.005, r - b), true);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 6);
}
