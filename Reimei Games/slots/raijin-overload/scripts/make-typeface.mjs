// Converts the bundled OFL fonts into three.js "typeface" JSON (only the glyphs
// the game needs), so 3D text can be extruded at runtime without a font parser.
//   node scripts/make-typeface.mjs
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/assets/fonts');
const ab = (p) => {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

function convert(file, chars, name) {
  const font = opentype.parse(ab(path.join(ROOT, file)));
  const scale = 1000 / font.unitsPerEm;
  const r = (v) => Math.round(v * scale);
  const glyphs = {};
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const ch of new Set(chars)) {
    const g = font.charToGlyph(ch);
    if (!g || (g.index === 0 && ch !== ' ')) {
      console.warn(`  ${name}: missing glyph ${ch}`);
      continue;
    }
    let o = '';
    for (const c of g.path.commands) {
      if (c.type === 'M') o += `m ${r(c.x)} ${r(c.y)} `;
      else if (c.type === 'L') o += `l ${r(c.x)} ${r(c.y)} `;
      else if (c.type === 'Q') o += `q ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)} `;
      else if (c.type === 'C') o += `b ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} `;
    }
    const bb = g.getBoundingBox();
    glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.x1), x_max: r(bb.x2), o: o.trim() };
    xMin = Math.min(xMin, r(bb.x1));
    xMax = Math.max(xMax, r(bb.x2));
    yMin = Math.min(yMin, r(bb.y1));
    yMax = Math.max(yMax, r(bb.y2));
  }
  const json = {
    glyphs,
    familyName: font.names.fontFamily?.en ?? name,
    ascender: r(font.ascender),
    descender: r(font.descender),
    underlinePosition: r(font.tables.post?.underlinePosition ?? -100),
    underlineThickness: r(font.tables.post?.underlineThickness ?? 50),
    boundingBox: { yMin, xMin, yMax, xMax },
    resolution: 1000,
    original_font_information: { license: 'SIL Open Font License 1.1', family: font.names.fontFamily?.en },
    cssFontWeight: 'normal',
    cssFontStyle: 'normal',
  };
  fs.writeFileSync(path.join(OUT, `${name}.typeface.json`), JSON.stringify(json));
  console.log(`${name}: ${Object.keys(glyphs).length} glyphs`);
}

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789x+-.,:!?/%€$ ';
convert('node_modules/@fontsource/orbitron/files/orbitron-latin-900-normal.woff', LATIN, 'orbitron-black');
convert('node_modules/@fontsource/dela-gothic-one/files/dela-gothic-one-japanese-400-normal.woff', '雷神電力鬼風嵐天怒王', 'dela-kanji');
convert('node_modules/@fontsource/dela-gothic-one/files/dela-gothic-one-latin-400-normal.woff', LATIN, 'dela-latin');
