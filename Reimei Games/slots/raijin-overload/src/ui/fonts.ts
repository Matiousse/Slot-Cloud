// Web fonts for the HTML overlay (all bundled from @fontsource, no network).
//
//   Orbitron 700/900      numbers, headings, buttons        -> font-family 'Orbitron'
//   Chakra Petch 500-700  body copy, labels                 -> font-family 'Chakra Petch'
//   Dela Gothic One       ONLY the few kanji the UI uses    -> font-family 'Raijin Kanji'
//
// Registered through the FontFace API with woff2 only (every target browser
// supports it) so the build does not ship the .woff fallbacks. The Japanese
// font is huge (~1 MB): we load just the 8 unicode-range chunks (~6-9 KB each)
// that contain the kanji below, and restrict each face to those code points so
// nothing else is ever fetched.

import orb700 from '@fontsource/orbitron/files/orbitron-latin-700-normal.woff2?url';
import orb900 from '@fontsource/orbitron/files/orbitron-latin-900-normal.woff2?url';
import ck500 from '@fontsource/chakra-petch/files/chakra-petch-latin-500-normal.woff2?url';
import ck600 from '@fontsource/chakra-petch/files/chakra-petch-latin-600-normal.woff2?url';
import ck700 from '@fontsource/chakra-petch/files/chakra-petch-latin-700-normal.woff2?url';
import ckx500 from '@fontsource/chakra-petch/files/chakra-petch-latin-ext-500-normal.woff2?url';
import ckx600 from '@fontsource/chakra-petch/files/chakra-petch-latin-ext-600-normal.woff2?url';
import ckx700 from '@fontsource/chakra-petch/files/chakra-petch-latin-ext-700-normal.woff2?url';
import dg82 from '@fontsource/dela-gothic-one/files/dela-gothic-one-82-400-normal.woff2?url';
import dg87 from '@fontsource/dela-gothic-one/files/dela-gothic-one-87-400-normal.woff2?url';
import dg93 from '@fontsource/dela-gothic-one/files/dela-gothic-one-93-400-normal.woff2?url';
import dg95 from '@fontsource/dela-gothic-one/files/dela-gothic-one-95-400-normal.woff2?url';
import dg105 from '@fontsource/dela-gothic-one/files/dela-gothic-one-105-400-normal.woff2?url';
import dg113 from '@fontsource/dela-gothic-one/files/dela-gothic-one-113-400-normal.woff2?url';
import dg115 from '@fontsource/dela-gothic-one/files/dela-gothic-one-115-400-normal.woff2?url';
import dg117 from '@fontsource/dela-gothic-one/files/dela-gothic-one-117-400-normal.woff2?url';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

/**
 * Kanji used by the overlay, with the Dela Gothic chunk that contains each one.
 * 雷 thunder · 嵐 storm · 鬼 demon · 怒 wrath · 王 king · 神 god · 天 heaven · 電 electric · 力 power · 大 great
 */
const KANJI: [string, string][] = [
  [dg82, '雷'],
  [dg87, '嵐'],
  [dg93, '鬼'],
  [dg95, '怒'],
  [dg105, '王'],
  [dg113, '神天'],
  [dg115, '電力'],
  [dg117, '大'],
];

/** Every kanji the UI may print (anything else falls back to the system font). */
export const UI_KANJI = KANJI.map(([, k]) => k).join('');

const range = (chars: string) =>
  [...chars].map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase()).join(',');

let ready: Promise<void> | null = null;

/**
 * Register the faces (idempotent). Resolves once the primary faces are loaded,
 * or after `timeoutMs` so a slow device never blocks the game.
 */
export function loadFonts(timeoutMs = 2500): Promise<void> {
  if (ready) return ready;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return (ready = Promise.resolve());
  const faces: FontFace[] = [];
  const add = (family: string, url: string, weight: string, unicodeRange: string) => {
    const f = new FontFace(family, `url(${url}) format('woff2')`, { weight, style: 'normal', display: 'swap', unicodeRange });
    document.fonts.add(f);
    faces.push(f);
    return f;
  };
  const primary = [
    add('Orbitron', orb700, '700', LATIN),
    add('Orbitron', orb900, '900', LATIN),
    add('Chakra Petch', ck600, '600', LATIN),
    add('Chakra Petch', ck500, '500', LATIN),
    add('Chakra Petch', ck700, '700', LATIN),
  ];
  // secondary faces are fetched lazily by the browser when a glyph needs them
  add('Chakra Petch', ckx500, '500', LATIN_EXT);
  add('Chakra Petch', ckx600, '600', LATIN_EXT);
  add('Chakra Petch', ckx700, '700', LATIN_EXT);
  const kanji = KANJI.map(([url, chars]) => add('Raijin Kanji', url, '400', range(chars)));
  const all = Promise.allSettled([...primary, kanji[0], kanji[5]].map((f) => f.load())).then(() => undefined);
  ready = Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  return ready;
}

loadFonts();
