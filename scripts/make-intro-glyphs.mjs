// Extracts the vector outlines used by the Reimei Games studio intro, so the
// logo renders identically everywhere without loading a font at runtime.
//   node scripts/make-intro-glyphs.mjs  ->  src/intro/glyphs.json
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (p) => {
  const b = fs.readFileSync(path.join(ROOT, p));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const orbitron = load('node_modules/@fontsource/orbitron/files/orbitron-latin-900-normal.woff');
const orbitronBold = load('node_modules/@fontsource/orbitron/files/orbitron-latin-700-normal.woff');
const dela = load('node_modules/@fontsource/dela-gothic-one/files/dela-gothic-one-japanese-400-normal.woff');

/** One SVG path per glyph, laid out on a baseline at y = 0, with optional tracking. */
function word(font, text, size, tracking = 0) {
  const glyphs = [];
  let x = 0;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    const p = g.getPath(x, 0, size);
    const bb = p.getBoundingBox();
    glyphs.push({ ch, d: p.toPathData(2), x1: +bb.x1.toFixed(2), x2: +bb.x2.toFixed(2), y1: +bb.y1.toFixed(2), y2: +bb.y2.toFixed(2) });
    x += (g.advanceWidth / font.unitsPerEm) * size + tracking;
  }
  const x1 = Math.min(...glyphs.map((g) => g.x1));
  const x2 = Math.max(...glyphs.map((g) => g.x2));
  const y1 = Math.min(...glyphs.map((g) => g.y1));
  const y2 = Math.max(...glyphs.map((g) => g.y2));
  return { glyphs, box: { x: x1, y: y1, w: +(x2 - x1).toFixed(2), h: +(y2 - y1).toFixed(2) } };
}

const out = {
  reimei: word(orbitron, 'REIMEI', 100, 6),
  games: word(orbitronBold, 'GAMES', 30, 24),
  kanji: word(dela, '黎明', 100, 0),
};
fs.writeFileSync(path.join(ROOT, 'src/intro/glyphs.json'), JSON.stringify(out));
for (const [k, v] of Object.entries(out)) console.log(k, v.box);
