// Iconic 2D outlines used by several parts (crest, tomoe commas, spikes).

import { type P2, type Poly } from './geo';

/**
 * One tomoe comma (unit radius), head at angle `rot`, tail sweeping clockwise.
 * Returned CCW-agnostic (plate() fixes orientation).
 */
export function tomoePoly(R = 1, rot = 0, sweep = Math.PI * 0.62, n = 22): Poly {
  const d = 0.42 * R, hr = 0.34 * R, rt = 0.86 * R;
  const pts: Poly = [];
  const hx = d, hy = 0;
  // head arc from inner point, around the far side, to the outer point
  for (let i = 0; i <= n; i++) {
    const th = Math.PI - (i / n) * Math.PI;
    pts.push([hx + Math.cos(th) * hr, hy + Math.sin(th) * hr]);
  }
  // outer edge spiralling out to the tip
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const a = -s * sweep;
    const r = d + hr + (rt - d - hr) * Math.sin((s * Math.PI) / 2);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // inner edge back to the head
  for (let i = n - 1; i >= 1; i--) {
    const s = i / n;
    const a = -s * sweep;
    const r = d - hr * 0.6 + (rt - (d - hr * 0.6)) * Math.pow(s, 0.6);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const c = Math.cos(rot), sn = Math.sin(rot);
  return pts.map(([x, y]) => [x * c - y * sn, x * sn + y * c] as P2);
}

/**
 * Maedate crescent: horns up. Returns the outline and the inner edge curve
 * (for the glow line). Units: half-width W, horn height H, base thickness T.
 */
export function crescent(W: number, H: number, T: number, n = 40): { outline: Poly; inner: P2[]; outer: P2[] } {
  const outer: P2[] = [];
  const inner: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n;
    const au = Math.abs(u);
    const flare = Math.sign(u) * 0.16 * Math.pow(au, 7) * W; // tips hook outward
    const y = H * Math.pow(au, 1.75);
    const x = u * W + flare;
    outer.push([x, y]);
    // inner edge: thickness tapers to 0 at the tips (measured mostly vertically)
    const th = T * Math.pow(Math.max(0, 1 - Math.pow(au, 2.4)), 0.75);
    // push inward along the curve normal
    const dy = (H * 1.75 * Math.pow(Math.max(au, 1e-4), 0.75)) * Math.sign(u);
    const nx = -dy, ny = W; // normal (pointing up/in)
    const nl = Math.hypot(nx, ny);
    inner.push([x + (nx / nl) * th, y + (ny / nl) * th]);
  }
  const outline: Poly = [...outer, ...inner.slice(1, -1).reverse()];
  return { outline, inner: inner.slice(2, -2), outer };
}

/** Flame / ray spike pointing +Y, base width w, length l, swept by `sweep`. */
export function spikePoly(w: number, l: number, sweep = 0.15, n = 8): Poly {
  const pts: Poly = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    pts.push([w / 2 * (1 - s) ** 1.3 + sweep * l * s * s, s * l]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const s = i / n;
    pts.push([-w / 2 * (1 - s) ** 0.9 + sweep * l * s * s, s * l]);
  }
  pts.push([-w / 2, 0]);
  return pts;
}
