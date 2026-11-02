// Draw text on a canvas from the bundled typeface outlines (no system fonts:
// kanji/latin always render identically on every device) + hand-built neon
// tube strokes for a few katakana (カミナリ / ライジン).

import orbitron from '../../assets/fonts/orbitron-black.typeface.json';
import delaKanji from '../../assets/fonts/dela-kanji.typeface.json';
import delaLatin from '../../assets/fonts/dela-latin.typeface.json';

interface TypefaceGlyph {
  ha: number;
  x_min?: number;
  x_max?: number;
  o?: string;
}
interface Typeface {
  glyphs: Record<string, TypefaceGlyph>;
  resolution: number;
  ascender: number;
  descender: number;
}

export type GlyphFont = 'display' | 'heavy' | 'kanji';
const FACES: Record<GlyphFont, Typeface> = {
  display: orbitron as unknown as Typeface,
  heavy: delaLatin as unknown as Typeface,
  kanji: delaKanji as unknown as Typeface,
};

const pathCache = new Map<string, Path2D | null>();

/** Glyph outline as a Path2D in font units (y down, baseline at 0). */
function glyphPath(font: GlyphFont, ch: string): Path2D | null {
  const key = font + ch;
  if (pathCache.has(key)) return pathCache.get(key)!;
  const g = FACES[font].glyphs[ch];
  let p: Path2D | null = null;
  if (g?.o) {
    p = new Path2D();
    const o = g.o.split(' ');
    for (let i = 0; i < o.length; ) {
      const c = o[i++];
      if (c === 'm') p.moveTo(+o[i++], -o[i++]);
      else if (c === 'l') p.lineTo(+o[i++], -o[i++]);
      else if (c === 'q') {
        const x = +o[i++], y = -o[i++], cx = +o[i++], cy = -o[i++];
        p.quadraticCurveTo(cx, cy, x, y);
      } else if (c === 'b') {
        const x = +o[i++], y = -o[i++], c1x = +o[i++], c1y = -o[i++], c2x = +o[i++], c2y = -o[i++];
        p.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      } else if (c === 'z') p.closePath();
    }
  }
  pathCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------- katakana strokes (unit box, y down)

type Stroke = [number, number][];
const KATA: Record<string, Stroke[]> = {
  カ: [
    [[0.14, 0.34], [0.82, 0.34], [0.78, 0.78], [0.62, 0.9]],
    [[0.46, 0.08], [0.44, 0.5], [0.18, 0.92]],
  ],
  ミ: [
    [[0.26, 0.14], [0.72, 0.28]],
    [[0.28, 0.44], [0.68, 0.56]],
    [[0.2, 0.72], [0.8, 0.9]],
  ],
  ナ: [
    [[0.08, 0.36], [0.92, 0.36]],
    [[0.54, 0.06], [0.54, 0.56], [0.28, 0.92]],
  ],
  リ: [
    [[0.3, 0.12], [0.3, 0.6]],
    [[0.7, 0.08], [0.7, 0.56], [0.4, 0.94]],
  ],
  ラ: [
    [[0.24, 0.12], [0.76, 0.12]],
    [[0.14, 0.36], [0.82, 0.36], [0.72, 0.68], [0.36, 0.94]],
  ],
  イ: [
    [[0.66, 0.06], [0.12, 0.56]],
    [[0.5, 0.36], [0.5, 0.94]],
  ],
  ジ: [
    [[0.12, 0.2], [0.34, 0.3]],
    [[0.1, 0.48], [0.32, 0.58]],
    [[0.16, 0.92], [0.52, 0.74], [0.8, 0.36]],
    [[0.74, 0.04], [0.8, 0.18]],
    [[0.88, 0.02], [0.94, 0.16]],
  ],
  ン: [
    [[0.18, 0.2], [0.4, 0.36]],
    [[0.16, 0.9], [0.56, 0.72], [0.86, 0.3]],
  ],
};

export function isKatakana(ch: string) {
  return ch in KATA;
}

function strokePath(ch: string, x: number, y: number, size: number): Path2D {
  const p = new Path2D();
  for (const s of KATA[ch]) {
    p.moveTo(x + s[0][0] * size, y + s[0][1] * size);
    for (let i = 1; i < s.length; i++) p.lineTo(x + s[i][0] * size, y + s[i][1] * size);
  }
  return p;
}

export interface GlyphRun {
  /** Path in canvas pixels. */
  path: Path2D;
  /** True for stroke-only glyphs (katakana tubes). */
  stroke: boolean;
}

/**
 * Lay out `text` at `size` px (em) starting at (x, baseline y) horizontally,
 * or top-down when `vertical` (each glyph centred on x).
 */
export function layoutText(text: string, font: GlyphFont, size: number, x: number, y: number, vertical = false, spacing = 0.06): GlyphRun[] {
  const out: GlyphRun[] = [];
  const face = FACES[font];
  const scale = size / face.resolution;
  let cx = x, cy = y;
  for (const ch of text) {
    if (ch === ' ') {
      if (vertical) cy += size * 0.5;
      else cx += size * 0.35;
      continue;
    }
    if (isKatakana(ch)) {
      const gx = vertical ? x - size / 2 : cx;
      const gy = vertical ? cy : cy - size * 0.86;
      out.push({ path: strokePath(ch, gx, gy, size * 0.92), stroke: true });
      if (vertical) cy += size * (1 + spacing);
      else cx += size * (1 + spacing);
      continue;
    }
    const g = face.glyphs[ch];
    const gp = glyphPath(font, ch);
    if (!g) continue;
    const adv = g.ha * scale;
    if (gp) {
      const path = new Path2D();
      const m = new DOMMatrix();
      if (vertical) {
        const w = ((g.x_max ?? g.ha) - (g.x_min ?? 0)) * scale;
        const asc = font === 'kanji' ? 0.86 : 0.74;
        m.translateSelf(x - w / 2 - (g.x_min ?? 0) * scale, cy + size * asc);
      } else m.translateSelf(cx, cy);
      m.scaleSelf(scale, scale);
      path.addPath(gp, m);
      out.push({ path, stroke: false });
    }
    if (vertical) cy += size * (font === 'kanji' ? 1 + spacing : 0.8 + spacing);
    else cx += adv + size * spacing;
  }
  return out;
}

/** Measured advance width of a horizontal run (px). */
export function measureText(text: string, font: GlyphFont, size: number, spacing = 0.06): number {
  const face = FACES[font];
  const scale = size / face.resolution;
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += size * 0.35;
    else if (isKatakana(ch)) w += size * (1 + spacing);
    else w += (face.glyphs[ch]?.ha ?? 0) * scale + size * spacing;
  }
  return w - size * spacing;
}
