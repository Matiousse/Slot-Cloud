// Procedural vector art for every symbol, drawn with Canvas 2D at any size.
// No bitmap assets: everything is generated at runtime (crisp on any DPR).

import type { SymbolCode } from '../../shared/game';

export const FONT_DISPLAY = '"Luckiest Guy", "Lilita One", Impact, sans-serif';
export const FONT_UI = '"Lilita One", "Luckiest Guy", system-ui, sans-serif';

const INK = '#12082a';

type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function rad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], x1 = x, y1 = y) {
  const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

/** Fill + thick ink outline + soft drop shadow. */
function inked(ctx: Ctx, path: Path2D, fill: string | CanvasGradient, width = 6, ink = INK) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = ink;
  ctx.stroke(path);
  ctx.restore();
  ctx.fillStyle = fill;
  ctx.fill(path);
}

/** Glossy highlight clipped to a path (upper half sheen). */
function gloss(ctx: Ctx, path: Path2D, y0: number, y1: number, alpha = 0.55) {
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = lin(ctx, 0, y0, 0, y1, [
    [0, `rgba(255,255,255,${alpha})`],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(0, y0, 100, y1 - y0);
  ctx.restore();
}

function sparkle(ctx: Ctx, x: number, y: number, r: number, color = '#ffffff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.fill();
  ctx.restore();
}

export function boltPath(x: number, y: number, s: number): Path2D {
  // classic lightning bolt, ~ s wide and 1.7 s tall, top-left at (x, y)
  const p = new Path2D();
  p.moveTo(x + 0.55 * s, y);
  p.lineTo(x + 0.05 * s, y + 0.95 * s);
  p.lineTo(x + 0.45 * s, y + 0.95 * s);
  p.lineTo(x + 0.25 * s, y + 1.7 * s);
  p.lineTo(x + 0.95 * s, y + 0.65 * s);
  p.lineTo(x + 0.55 * s, y + 0.65 * s);
  p.lineTo(x + 0.8 * s, y);
  p.closePath();
  return p;
}

// ---------------------------------------------------------------- text helpers

export function outlinedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string | CanvasGradient,
  opts: { ink?: string; inkWidth?: number; font?: string; glow?: string; glowBlur?: number; align?: CanvasTextAlign } = {},
) {
  ctx.save();
  ctx.font = `${size}px ${opts.font ?? FONT_DISPLAY}`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = opts.glowBlur ?? size * 0.35;
  }
  ctx.lineWidth = opts.inkWidth ?? size * 0.16;
  ctx.strokeStyle = opts.ink ?? INK;
  ctx.strokeText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------- low symbols

const LOW_STYLE: Record<string, { text: string; top: string; mid: string; bot: string; glow: string }> = {
  L5: { text: '10', top: '#b7ffe6', mid: '#2de2a6', bot: '#087a5a', glow: '#2de2a6' },
  L4: { text: 'J', top: '#c9f2ff', mid: '#4cc3ff', bot: '#1450c8', glow: '#4cc3ff' },
  L3: { text: 'Q', top: '#ecdcff', mid: '#b67bff', bot: '#5b1fc4', glow: '#b67bff' },
  L2: { text: 'K', top: '#ffd9f3', mid: '#ff6fd0', bot: '#b0127a', glow: '#ff6fd0' },
  L1: { text: 'A', top: '#fff1c9', mid: '#ffb636', bot: '#d4550c', glow: '#ffb636' },
};

function drawLow(ctx: Ctx, code: string) {
  const st = LOW_STYLE[code];
  const size = st.text.length > 1 ? 58 : 74;
  const y = 54;
  // neon halo plate
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = rad(ctx, 50, 52, 4, 46, [
    [0, st.glow],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  ctx.restore();

  ctx.save();
  ctx.font = `${size}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // outer ink with glow
  ctx.shadowColor = st.glow;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 11;
  ctx.strokeStyle = INK;
  ctx.strokeText(st.text, 50, y);
  ctx.shadowBlur = 0;
  // light rim
  ctx.lineWidth = 4;
  ctx.strokeStyle = st.top;
  ctx.strokeText(st.text, 50, y);
  // body gradient
  ctx.fillStyle = lin(ctx, 0, y - size * 0.45, 0, y + size * 0.45, [
    [0, st.top],
    [0.45, st.mid],
    [1, st.bot],
  ]);
  ctx.fillText(st.text, 50, y);
  ctx.restore();

  // gloss on the glyph (source-in on an isolated layer at full resolution)
  const px = Math.max(1, ctx.getTransform().a * 100);
  const [g, gx] = makeCanvas(px, px);
  gx.scale(px / 100, px / 100);
  gx.font = `${size}px ${FONT_DISPLAY}`;
  gx.textAlign = 'center';
  gx.textBaseline = 'middle';
  gx.fillStyle = '#fff';
  gx.fillText(st.text, 50, y);
  gx.globalCompositeOperation = 'source-in';
  gx.fillStyle = lin(gx, 0, y - size * 0.5, 0, y, [
    [0, 'rgba(255,255,255,0.75)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  gx.fillRect(0, 0, 100, y - 2);
  gx.clearRect(0, y - 2, 100, 100);
  ctx.drawImage(g, 0, 0, 100, 100);
  sparkle(ctx, 70, 26, 5);
}

// ---------------------------------------------------------------- high symbols

function drawBell(ctx: Ctx) {
  // halo
  ctx.fillStyle = rad(ctx, 50, 50, 5, 50, [
    [0, 'rgba(255,214,90,0.35)'],
    [1, 'rgba(255,214,90,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);

  const bell = new Path2D();
  bell.moveTo(50, 14);
  bell.bezierCurveTo(30, 14, 25, 32, 25, 48);
  bell.bezierCurveTo(25, 62, 20, 68, 13, 74);
  bell.lineTo(87, 74);
  bell.bezierCurveTo(80, 68, 75, 62, 75, 48);
  bell.bezierCurveTo(75, 32, 70, 14, 50, 14);
  bell.closePath();
  const lip = new Path2D();
  lip.roundRect(10, 70, 80, 11, 5.5);
  const knob = new Path2D();
  knob.arc(50, 12, 6, 0, Math.PI * 2);
  const clapper = new Path2D();
  clapper.arc(50, 85, 8, 0, Math.PI * 2);

  const gold = lin(ctx, 20, 10, 80, 90, [
    [0, '#fff6c4'],
    [0.35, '#ffd33d'],
    [0.7, '#e08a00'],
    [1, '#8a4300'],
  ]);
  inked(ctx, clapper, rad(ctx, 47, 82, 1, 9, [[0, '#9ff6ff'], [1, '#1679c9']]), 5);
  inked(ctx, knob, gold, 5);
  inked(ctx, bell, gold, 6);
  inked(ctx, lip, lin(ctx, 0, 70, 0, 81, [[0, '#ffe680'], [1, '#c26a00']]), 5);
  gloss(ctx, bell, 14, 48, 0.6);
  // shine streak
  ctx.save();
  ctx.clip(bell);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(35, 30);
  ctx.quadraticCurveTo(31, 45, 32, 60);
  ctx.stroke();
  ctx.restore();
  // lightning emblem
  const b = boltPath(42, 32, 17);
  inked(ctx, b, lin(ctx, 0, 32, 0, 62, [[0, '#e6fdff'], [1, '#2bb8ff']]), 3);
  sparkle(ctx, 72, 24, 6);
}

function drawSeven(ctx: Ctx) {
  ctx.fillStyle = rad(ctx, 50, 50, 5, 50, [
    [0, 'rgba(255,60,90,0.35)'],
    [1, 'rgba(255,60,90,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  const seven = new Path2D();
  seven.moveTo(18, 14);
  seven.lineTo(84, 14);
  seven.lineTo(84, 28);
  seven.bezierCurveTo(66, 46, 56, 66, 54, 90);
  seven.lineTo(32, 90);
  seven.bezierCurveTo(34, 66, 46, 46, 60, 31);
  seven.lineTo(32, 31);
  seven.lineTo(29, 38);
  seven.lineTo(18, 38);
  seven.closePath();
  // gold rim (thick) then red body
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.lineWidth = 14;
  ctx.strokeStyle = INK;
  ctx.stroke(seven);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 8;
  ctx.strokeStyle = lin(ctx, 0, 10, 0, 92, [[0, '#fff3b0'], [0.5, '#ffc31f'], [1, '#b05a00']]);
  ctx.stroke(seven);
  ctx.restore();
  ctx.fillStyle = lin(ctx, 0, 14, 0, 90, [
    [0, '#ff9aa8'],
    [0.4, '#ff2d55'],
    [1, '#8c0021'],
  ]);
  ctx.fill(seven);
  gloss(ctx, seven, 14, 40, 0.65);
  sparkle(ctx, 78, 20, 6);
  sparkle(ctx, 30, 74, 4, '#ffd6de');
}

function drawDiamond(ctx: Ctx) {
  ctx.fillStyle = rad(ctx, 50, 50, 5, 50, [
    [0, 'rgba(80,220,255,0.38)'],
    [1, 'rgba(80,220,255,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  const top = 24, girdle = 42, bottom = 90, l = 10, r = 90, tl = 28, tr = 72;
  const outline = new Path2D();
  outline.moveTo(tl, top);
  outline.lineTo(tr, top);
  outline.lineTo(r, girdle);
  outline.lineTo(50, bottom);
  outline.lineTo(l, girdle);
  outline.closePath();
  inked(ctx, outline, '#1aa6e0', 7);
  const facet = (pts: number[], color: string) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,40,90,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  // crown facets
  facet([tl, top, 40, top, 30, girdle, l, girdle], '#8eeaff');
  facet([40, top, 60, top, 50, girdle, 30, girdle], '#d8fbff');
  facet([60, top, tr, top, r, girdle, 70, girdle], '#5fd2ff');
  facet([40, top, 30, girdle, 50, girdle], '#b8f4ff');
  facet([60, top, 50, girdle, 70, girdle], '#7fdfff');
  // pavilion facets
  facet([l, girdle, 30, girdle, 50, bottom], '#1d8fe0');
  facet([30, girdle, 50, girdle, 50, bottom], '#4cc6ff');
  facet([50, girdle, 70, girdle, 50, bottom], '#2aa8f0');
  facet([70, girdle, r, girdle, 50, bottom], '#0f63c2');
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(l + 3, girdle);
  ctx.lineTo(r - 3, girdle);
  ctx.stroke();
  ctx.restore();
  gloss(ctx, outline, top, girdle + 6, 0.35);
  sparkle(ctx, 33, 30, 7);
  sparkle(ctx, 74, 54, 4);
}

function drawCrown(ctx: Ctx) {
  ctx.fillStyle = rad(ctx, 50, 50, 5, 52, [
    [0, 'rgba(255,200,60,0.4)'],
    [1, 'rgba(255,200,60,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  const crown = new Path2D();
  crown.moveTo(14, 74);
  crown.lineTo(10, 32);
  crown.lineTo(30, 50);
  crown.lineTo(50, 20);
  crown.lineTo(70, 50);
  crown.lineTo(90, 32);
  crown.lineTo(86, 74);
  crown.closePath();
  const band = new Path2D();
  band.roundRect(12, 68, 76, 18, 6);
  const gold = lin(ctx, 10, 15, 90, 90, [
    [0, '#fff8d0'],
    [0.3, '#ffd84a'],
    [0.65, '#f09a00'],
    [1, '#8f4700'],
  ]);
  // velvet inside
  const velvet = new Path2D();
  velvet.moveTo(22, 66);
  velvet.lineTo(20, 46);
  velvet.lineTo(30, 56);
  velvet.lineTo(50, 34);
  velvet.lineTo(70, 56);
  velvet.lineTo(80, 46);
  velvet.lineTo(78, 66);
  velvet.closePath();
  inked(ctx, crown, gold, 7);
  ctx.fillStyle = lin(ctx, 0, 34, 0, 66, [[0, '#a23bff'], [1, '#4b0fa8']]);
  ctx.fill(velvet);
  gloss(ctx, crown, 20, 55, 0.45);
  inked(ctx, band, lin(ctx, 0, 68, 0, 86, [[0, '#ffe680'], [0.5, '#ffbf1a'], [1, '#b35d00']]), 6);
  gloss(ctx, band, 68, 77, 0.6);
  // gems
  const gem = (x: number, y: number, r: number, c1: string, c2: string) => {
    const p = new Path2D();
    p.arc(x, y, r, 0, Math.PI * 2);
    inked(ctx, p, rad(ctx, x - r * 0.3, y - r * 0.3, 0.5, r, [[0, '#ffffff'], [0.35, c1], [1, c2]]), 3);
  };
  gem(50, 77, 6.5, '#ff4d6d', '#8a0020');
  gem(30, 77, 4.5, '#4dd2ff', '#0a4fa8');
  gem(70, 77, 4.5, '#4dd2ff', '#0a4fa8');
  // pearls on tips
  for (const [x, y] of [[10, 30], [50, 17], [90, 30]] as const) gem(x, y, 5.5, '#fff6e0', '#d4a64a');
  sparkle(ctx, 66, 26, 6);
}

// ---------------------------------------------------------------- specials

function cloudPath(cx: number, cy: number, w: number): Path2D {
  const p = new Path2D();
  const blobs: [number, number, number][] = [
    [-0.32, 0.08, 0.2],
    [-0.12, -0.08, 0.26],
    [0.14, -0.12, 0.28],
    [0.34, 0.06, 0.2],
    [0.0, 0.12, 0.24],
  ];
  for (const [dx, dy, r] of blobs) {
    p.moveTo(cx + dx * w + r * w, cy + dy * w);
    p.arc(cx + dx * w, cy + dy * w, r * w, 0, Math.PI * 2);
  }
  return p;
}

function drawWild(ctx: Ctx) {
  ctx.fillStyle = rad(ctx, 50, 50, 5, 52, [
    [0, 'rgba(255,230,80,0.35)'],
    [1, 'rgba(255,230,80,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  // bolt under the cloud
  inked(ctx, boltPath(38, 46, 26), lin(ctx, 0, 46, 0, 92, [[0, '#fffbe0'], [0.4, '#ffe14d'], [1, '#ff9d00']]), 5);
  // cloud (outline as union: stroke all then fill all)
  const cloud = cloudPath(50, 38, 86);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke(cloud);
  ctx.restore();
  ctx.fillStyle = lin(ctx, 0, 14, 0, 62, [[0, '#f3edff'], [0.45, '#a99be0'], [1, '#4c3a8f']]);
  ctx.fill(cloud);
  gloss(ctx, cloud, 10, 34, 0.7);
  outlinedText(ctx, 'WILD', 50, 44, 30, lin(ctx, 0, 30, 0, 58, [[0, '#fff8c0'], [0.5, '#ffd21f'], [1, '#ff8a00']]), {
    inkWidth: 7,
  });
  sparkle(ctx, 82, 18, 5);
}

function drawStormWild(ctx: Ctx) {
  // electric orb badge
  ctx.fillStyle = rad(ctx, 50, 48, 8, 54, [
    [0, 'rgba(120,230,255,0.55)'],
    [1, 'rgba(120,230,255,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  const ring = new Path2D();
  ring.arc(50, 46, 36, 0, Math.PI * 2);
  inked(ctx, ring, rad(ctx, 42, 36, 2, 40, [[0, '#ffffff'], [0.25, '#7fe9ff'], [0.65, '#2361e8'], [1, '#160b5c']]), 7);
  // inner swirl ring
  ctx.save();
  ctx.clip(ring);
  ctx.strokeStyle = 'rgba(190,245,255,0.55)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(50, 46, 28 - i * 7, i, i + 4.2);
    ctx.stroke();
  }
  ctx.restore();
  inked(ctx, boltPath(37, 18, 30), lin(ctx, 0, 18, 0, 70, [[0, '#ffffff'], [0.3, '#fff27a'], [1, '#ffb000']]), 5);
  gloss(ctx, ring, 10, 40, 0.45);
  // banner
  const banner = new Path2D();
  banner.roundRect(14, 74, 72, 20, 8);
  inked(ctx, banner, lin(ctx, 0, 74, 0, 94, [[0, '#ff5ad1'], [1, '#8a1aa8']]), 5);
  outlinedText(ctx, 'STORM', 50, 85, 17, '#fff', { inkWidth: 4 });
}

function drawScatter(ctx: Ctx) {
  // vortex disk (the spinning part is the same image rotated when drawn)
  ctx.fillStyle = rad(ctx, 50, 46, 6, 54, [
    [0, 'rgba(255,90,220,0.55)'],
    [1, 'rgba(255,90,220,0)'],
  ]);
  ctx.fillRect(0, 0, 100, 100);
  const disk = new Path2D();
  disk.arc(50, 46, 37, 0, Math.PI * 2);
  inked(ctx, disk, rad(ctx, 50, 46, 2, 38, [[0, '#ffffff'], [0.18, '#ffd1f7'], [0.45, '#c22fff'], [0.8, '#3b0b8f'], [1, '#14053d']]), 7);
  ctx.save();
  ctx.clip(disk);
  ctx.translate(50, 46);
  for (let arm = 0; arm < 4; arm++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const a = t * 4.2;
      const r = 4 + t * 36;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = arm % 2 ? 'rgba(120,240,255,0.85)' : 'rgba(255,170,250,0.85)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
  // eye
  const eye = new Path2D();
  eye.arc(50, 46, 9, 0, Math.PI * 2);
  ctx.save();
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 14;
  ctx.fillStyle = rad(ctx, 50, 46, 1, 10, [[0, '#ffffff'], [1, '#ffd9fb']]);
  ctx.fill(eye);
  ctx.restore();
}

/** Static part of the scatter drawn on top of the rotating vortex. */
function drawScatterBanner(ctx: Ctx) {
  const banner = new Path2D();
  banner.moveTo(8, 72);
  banner.lineTo(92, 72);
  banner.lineTo(86, 83);
  banner.lineTo(92, 94);
  banner.lineTo(8, 94);
  banner.lineTo(14, 83);
  banner.closePath();
  inked(ctx, banner, lin(ctx, 0, 72, 0, 94, [[0, '#fff1a8'], [0.5, '#ffc21a'], [1, '#d06a00']]), 5);
  gloss(ctx, banner, 72, 82, 0.5);
  outlinedText(ctx, 'BONUS', 50, 84, 20, lin(ctx, 0, 74, 0, 94, [[0, '#ffffff'], [1, '#ffe2ff']]), {
    inkWidth: 5,
    ink: '#5a0a6e',
  });
}

// ---------------------------------------------------------------- public

const DRAW: Record<SymbolCode, (ctx: Ctx) => void> = {
  L5: (c) => drawLow(c, 'L5'),
  L4: (c) => drawLow(c, 'L4'),
  L3: (c) => drawLow(c, 'L3'),
  L2: (c) => drawLow(c, 'L2'),
  L1: (c) => drawLow(c, 'L1'),
  H4: drawBell,
  H3: drawSeven,
  H2: drawDiamond,
  H1: drawCrown,
  WD: drawWild,
  SW: drawStormWild,
  SC: drawScatter,
};

/** Render one symbol into a square canvas of `px` pixels. */
export function renderSymbol(code: SymbolCode, px: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(px, px);
  ctx.scale(px / 100, px / 100);
  DRAW[code](ctx);
  return c;
}

export function renderScatterBanner(px: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(px, px);
  ctx.scale(px / 100, px / 100);
  drawScatterBanner(ctx);
  return c;
}

/** Vertical motion-blurred copy of a symbol (used while reels spin). */
export function blurVertical(src: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  const pad = Math.ceil(amount);
  const [c, ctx] = makeCanvas(src.width, src.height + pad * 2);
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    ctx.globalAlpha = i === Math.floor(steps / 2) ? 0.45 : 0.18;
    ctx.drawImage(src, 0, pad + ((i / (steps - 1)) * 2 - 1) * amount);
  }
  return c;
}

/** Tall expanded Storm Wild column (w x h pixels), without the multiplier badge. */
export function renderStormColumn(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  const r = Math.min(w, h) * 0.08;
  const body = new Path2D();
  body.roundRect(w * 0.04, h * 0.006, w * 0.92, h * 0.988, r);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
    [0, '#1b0b4a'],
    [0.4, '#2a1680'],
    [0.75, '#3a0e74'],
    [1, '#12052e'],
  ]);
  ctx.fillRect(0, 0, w, h);
  // swirling cloud bands
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * h;
    const cx = w * (0.5 + Math.sin(i * 1.7) * 0.35);
    ctx.fillStyle = rad(ctx, cx, y, 0, w * 0.55, [
      [0, `rgba(${120 + ((i * 37) % 80)},${90 + ((i * 53) % 90)},255,0.18)`],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(0, y - w * 0.6, w, w * 1.2);
  }
  // core glow
  ctx.fillStyle = lin(ctx, 0, 0, w, 0, [
    [0, 'rgba(80,200,255,0)'],
    [0.5, 'rgba(120,230,255,0.35)'],
    [1, 'rgba(80,200,255,0)'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // neon border
  ctx.save();
  ctx.lineWidth = Math.max(2, w * 0.035);
  ctx.strokeStyle = lin(ctx, 0, 0, 0, h, [
    [0, '#7ff3ff'],
    [0.5, '#ff6be6'],
    [1, '#7ff3ff'],
  ]);
  ctx.shadowColor = '#7ff3ff';
  ctx.shadowBlur = w * 0.12;
  ctx.stroke(body);
  ctx.restore();
  // vertical WILD letters
  const letters = ['W', 'I', 'L', 'D'];
  const fs = w * 0.36;
  letters.forEach((L, i) => {
    const y = h * (0.12 + i * 0.075);
    outlinedText(ctx, L, w / 2, y, fs, lin(ctx, 0, y - fs / 2, 0, y + fs / 2, [[0, '#fffbd0'], [0.5, '#ffd21f'], [1, '#ff8a00']]), {
      inkWidth: fs * 0.2,
      glow: '#ffcc33',
      glowBlur: fs * 0.3,
    });
  });
  return c;
}

/** Multiplier badge (e.g. "x25") as a canvas of `px` diameter. */
export function renderMultBadge(mult: number, px: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(px, px);
  ctx.scale(px / 100, px / 100);
  const hot = mult >= 25 ? ['#fff0f0', '#ff3b5c', '#7a0020'] : mult >= 10 ? ['#fff4d6', '#ff9f1a', '#8a3a00'] : ['#e8fbff', '#3fc7ff', '#0a3a9a'];
  const disk = new Path2D();
  disk.arc(50, 50, 44, 0, Math.PI * 2);
  ctx.save();
  ctx.shadowColor = hot[1];
  ctx.shadowBlur = 18;
  ctx.fillStyle = INK;
  ctx.fill(disk);
  ctx.restore();
  const inner = new Path2D();
  inner.arc(50, 50, 38, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, 40, 36, 2, 44, [[0, hot[0]], [0.45, hot[1]], [1, hot[2]]]);
  ctx.fill(inner);
  ctx.lineWidth = 4;
  ctx.strokeStyle = lin(ctx, 0, 10, 0, 90, [[0, '#fff6c0'], [0.5, '#ffc21a'], [1, '#a05000']]);
  ctx.stroke(inner);
  gloss(ctx, inner, 12, 50, 0.5);
  const text = `x${mult}`;
  const size = text.length >= 4 ? 30 : text.length === 3 ? 36 : 44;
  outlinedText(ctx, text, 50, 54, size, lin(ctx, 0, 34, 0, 70, [[0, '#ffffff'], [1, '#ffe9a8']]), { inkWidth: size * 0.2 });
  return c;
}

/** Game logo "CLOUDBURST". */
export function renderLogo(w: number): HTMLCanvasElement {
  const h = w * 0.3;
  const [c, ctx] = makeCanvas(w, h);
  const size = w * 0.15;
  const y = h * 0.52;
  ctx.font = `${size}px ${FONT_DISPLAY}`;
  // bolt behind the text
  ctx.save();
  ctx.translate(w * 0.5 - size * 0.4, y - size * 1.05);
  ctx.scale(size / 45, size / 45);
  ctx.shadowColor = '#7ff3ff';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#bff8ff';
  ctx.fill(boltPath(0, 0, 50));
  ctx.restore();
  outlinedText(
    ctx,
    'CLOUDBURST',
    w / 2,
    y,
    size,
    lin(ctx, 0, y - size / 2, 0, y + size / 2, [
      [0, '#ffffff'],
      [0.3, '#bdf3ff'],
      [0.55, '#5ab8ff'],
      [0.56, '#ff7ae6'],
      [1, '#a020c8'],
    ]),
    { inkWidth: size * 0.2, glow: 'rgba(255,90,230,0.9)', glowBlur: size * 0.45 },
  );
  outlinedText(ctx, 'STORM WILDS', w / 2, y + size * 0.78, size * 0.3, lin(ctx, 0, 0, w, 0, [[0, '#ffe066'], [1, '#ffb000']]), {
    inkWidth: size * 0.07,
    font: FONT_UI,
  });
  return c;
}
