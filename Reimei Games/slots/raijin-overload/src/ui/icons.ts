// Inline SVG icons (no external assets): UI glyphs + stylised symbol fallbacks
// used by the paytable / buy / splash until real 3D renders are injected with
// setSymbolIcons() (see ui.ts).

const svg = (body: string, vb = '0 0 24 24', extra = '') =>
  `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;

const BOLT = 'M13.6 1.6 4.2 13.4h6.4l-1.9 9 10.4-12.6h-6.7z';

export const ICONS = {
  menu: svg('<path d="M4 6.5h16M4 12h10.5M4 17.5h16"/><path d="M17.5 12h2.5" stroke-opacity=".55"/>'),
  info: svg('<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M12 11v5.2M12 7.8v.2"/>'),
  soundOn: svg(
    '<path d="M3.5 9.2v5.6h3.8l5 4.2V5l-5 4.2z" fill="currentColor" stroke-width="1.4"/><path d="M15.6 8.8a4.6 4.6 0 0 1 0 6.4M18.3 6.1a8.4 8.4 0 0 1 0 11.8"/>',
  ),
  soundOff: svg(
    '<path d="M3.5 9.2v5.6h3.8l5 4.2V5l-5 4.2z" fill="currentColor" stroke-width="1.4"/><path d="m16 9.2 5 5.6M21 9.2l-5 5.6"/>',
  ),
  plus: svg('<path d="M12 5.5v13M5.5 12h13"/>', '0 0 24 24', ' stroke-width="2.4"'),
  minus: svg('<path d="M5.5 12h13"/>', '0 0 24 24', ' stroke-width="2.4"'),
  spin: svg(`<path d="${BOLT}" fill="currentColor" stroke="none"/>`),
  stop: svg('<path d="M7.5 6h9l1.5 1.5v9L16.5 18h-9L6 16.5v-9z" fill="currentColor" stroke="none"/>'),
  auto: svg(
    '<path d="M19.4 9.6A7.8 7.8 0 0 0 5.8 7.2"/><path d="M4.6 14.4a7.8 7.8 0 0 0 13.6 2.4"/><path d="M5.2 3.6v3.9h3.9M18.8 20.4v-3.9h-3.9"/><path d="M12.6 8.4 10 12.3h3.4L11.6 15.8" stroke-width="1.6"/>',
  ),
  turbo: svg('<path d="M4.5 5.5 11 12l-6.5 6.5M12.5 5.5 19 12l-6.5 6.5"/>', '0 0 24 24', ' stroke-width="2.4"'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', '0 0 24 24', ' stroke-width="2.2"'),
  chevron: svg('<path d="m6 9.5 6 6 6-6"/>'),
  bolt: svg(`<path d="${BOLT}" fill="currentColor" stroke="none"/>`),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', '0 0 24 24', ' stroke-width="2.6"'),
};

// ---------------------------------------------------------------- symbol fallbacks

let uid = 0;

/** Mitsudomoe (three tomoe commas) centred on 0,0 with outer radius 10. */
const TOMOE = 'M0-9A9 9 0 0 1 8.86 1.56 5.2 5.2 0 0 0 0-1.8 3.6 3.6 0 0 1 0-9z';
const mitsudomoe = (fill: string, gap = 'none') =>
  `<g fill="${fill}" stroke="${gap}" stroke-width="1"><path d="${TOMOE}"/><path d="${TOMOE}" transform="rotate(120)"/><path d="${TOMOE}" transform="rotate(240)"/></g>`;

const CARD: Record<string, [string, string, string]> = {
  // code: [glyph, bright, deep]
  L5: ['10', '#2de2c0', '#0b6b5b'],
  L4: ['J', '#3aa0ff', '#0d3c7a'],
  L3: ['Q', '#a66bff', '#3d1a7a'],
  L2: ['K', '#ff4fc8', '#7a0f5a'],
  L1: ['A', '#ff9a1f', '#8a4200'],
};

function royal(code: string, id: string) {
  const [g, c, d] = CARD[code];
  const size = g.length > 1 ? 50 : 64;
  return `<defs>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="${c}"/><stop offset=".62" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8ff"/><stop offset=".46" stop-color="#9aa8ba"/><stop offset=".52" stop-color="#2b3340"/><stop offset="1" stop-color="#c9d4e2"/></linearGradient>
    <radialGradient id="${id}g"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="50" cy="52" r="44" fill="url(#${id}g)"/>
  <text x="50" y="${g.length > 1 ? 69 : 74}" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="${size}" letter-spacing="-2"
    fill="url(#${id}f)" stroke="url(#${id}s)" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">${g}</text>
  <text x="50" y="${g.length > 1 ? 69 : 74}" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="${size}" letter-spacing="-2"
    fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".8">${g}</text>`;
}

const GOLD = (id: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffc93c"/><stop offset=".55" stop-color="#a8650c"/><stop offset=".75" stop-color="#e09a1a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>`;
const STEEL = (id: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8798"/><stop offset=".45" stop-color="#2a2f3a"/><stop offset="1" stop-color="#11141b"/></linearGradient>`;

const BODY: Record<string, (id: string) => string> = {
  H4: (id) => `<defs>${GOLD(id + 'g')}${STEEL(id + 's')}
      <linearGradient id="${id}c" x1="0" x2="1"><stop offset="0" stop-color="#0a3a52"/><stop offset=".5" stop-color="#e6fbff"/><stop offset="1" stop-color="#0a3a52"/></linearGradient>
      <radialGradient id="${id}h"><stop offset="0" stop-color="#38e8ff" stop-opacity=".7"/><stop offset="1" stop-color="#38e8ff" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="50" cy="50" rx="34" ry="44" fill="url(#${id}h)"/>
    <rect x="32" y="18" width="36" height="64" rx="11" fill="#06202e" stroke="#38e8ff" stroke-opacity=".5" stroke-width="1.2"/>
    <rect x="42" y="24" width="16" height="52" rx="8" fill="url(#${id}c)"/>
    <path d="M50 26 46 40h7l-5 11h6l-7 20" stroke="#fff" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
    <rect x="35.5" y="22" width="4" height="54" rx="2" fill="#fff" opacity=".22"/>
    <rect x="28" y="9" width="44" height="13" rx="3" fill="url(#${id}s)" stroke="#000" stroke-opacity=".6"/>
    <rect x="28" y="78" width="44" height="13" rx="3" fill="url(#${id}s)" stroke="#000" stroke-opacity=".6"/>
    <rect x="30" y="21" width="40" height="4" rx="1" fill="url(#${id}g)"/><rect x="30" y="75" width="40" height="4" rx="1" fill="url(#${id}g)"/>
    <circle cx="36" cy="15.5" r="1.6" fill="#ffc93c"/><circle cx="64" cy="15.5" r="1.6" fill="#ffc93c"/><circle cx="36" cy="84.5" r="1.6" fill="#ffc93c"/><circle cx="64" cy="84.5" r="1.6" fill="#ffc93c"/>`,
  H3: (id) => `<defs>${GOLD(id + 'g')}
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6fbff"/><stop offset=".5" stop-color="#38e8ff"/><stop offset="1" stop-color="#0b5f8a"/></linearGradient>
      <linearGradient id="${id}h" x1="0" x2="1"><stop offset="0" stop-color="#38e8ff" stop-opacity="0"/><stop offset=".5" stop-color="#38e8ff" stop-opacity=".55"/><stop offset="1" stop-color="#38e8ff" stop-opacity="0"/></linearGradient></defs>
    <g transform="rotate(-45 50 50)">
      <rect x="34" y="40" width="64" height="20" rx="10" fill="url(#${id}h)"/>
      <path d="M39 46.2 86 44.8q9 .4 9.5 4.4L39 53.8z" fill="url(#${id}b)"/>
      <path d="M41 49.6 92 48.6" stroke="#fff" stroke-width="1.2" opacity=".9"/>
      <rect x="35.5" y="45" width="5" height="10" rx="1" fill="url(#${id}g)"/>
      <ellipse cx="33" cy="50" rx="3.6" ry="12.5" fill="url(#${id}g)" stroke="#5a3404" stroke-width=".8"/>
      <rect x="6" y="45" width="25" height="10" rx="3" fill="#1a0a0c"/>
      <path d="M8 45l4 10M13 45l4 10M18 45l4 10M23 45l4 10M8 55l4-10M13 55l4-10M18 55l4-10M23 55l4-10" stroke="#b3121f" stroke-width="1.6"/>
      <rect x="3" y="45.5" width="4" height="9" rx="1.5" fill="url(#${id}g)"/>
    </g>`,
  H2: (id) => `<defs>${GOLD(id + 'g')}
      <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6fbff"/><stop offset=".5" stop-color="#7fd8ff"/><stop offset="1" stop-color="#6a3cff"/></linearGradient>
      <linearGradient id="${id}b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b78cff"/><stop offset="1" stop-color="#2a0f6a"/></linearGradient>
      <radialGradient id="${id}h"><stop offset="0" stop-color="#a66bff" stop-opacity=".65"/><stop offset="1" stop-color="#38e8ff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#${id}h)"/>
    <path d="M50 8 78 28 72 72 50 92 28 72 22 28z" fill="url(#${id}b)"/>
    <path d="M50 8 78 28 50 40z" fill="#d9c8ff" opacity=".9"/><path d="M50 8 22 28 50 40z" fill="url(#${id}a)"/>
    <path d="M22 28 50 40 28 72z" fill="#7a4cff" opacity=".85"/><path d="M78 28 50 40 72 72z" fill="#4a20b8"/>
    <path d="M28 72 50 40 50 92z" fill="url(#${id}a)" opacity=".75"/><path d="M72 72 50 40 50 92z" fill="#2c0f7a"/>
    <path d="M50 8 78 28 72 72 50 92 28 72 22 28z" fill="none" stroke="#e6fbff" stroke-opacity=".6" stroke-width="1.2"/>
    <path d="M36 22 44 18" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <path d="M18 24 26 30 22 36zM82 24 74 30 78 36zM26 78 31 70 35 77zM74 78 69 70 65 77z" fill="url(#${id}g)" stroke="#5a3404" stroke-width=".6"/>`,
  H1: (id) => `<defs>${GOLD(id + 'g')}${STEEL(id + 's')}
      <radialGradient id="${id}h"><stop offset="0" stop-color="#ffc93c" stop-opacity=".5"/><stop offset="1" stop-color="#ffc93c" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="54" r="46" fill="url(#${id}h)"/>
    <path d="M47 42C38 26 25 13 5 5c13 9 24 21 33 39zM53 42C62 26 75 13 95 5 82 14 71 26 62 44z" fill="url(#${id}g)" stroke="#6b3e05" stroke-width=".9"/>
    <path d="M44 39C36 26 26 16 12 9M56 39c8-13 18-23 32-30" stroke="#fff3c4" stroke-width=".8" fill="none" opacity=".7"/>
    <path d="M18 70q0-34 32-36 32 2 32 36z" fill="url(#${id}g)" stroke="#6b3e05" stroke-width="1.2"/>
    <path d="M28 52q22-10 44 0M24 61q26-9 52 0" stroke="#7a4708" stroke-width="1.4" fill="none" opacity=".7"/>
    <path d="M10 68h80l-7 10H17z" fill="url(#${id}g)" stroke="#6b3e05" stroke-width="1"/>
    <path d="M16 78h68l-6 9H22z" fill="#b3121f" stroke="#4a0509" stroke-width="1"/>
    <path d="M20 82.5h60" stroke="#ffc93c" stroke-width="1" stroke-dasharray="3 3"/>
    <path d="M34 70h32l-4 7H38z" fill="url(#${id}s)"/>
    <circle cx="50" cy="45" r="5.5" fill="#b3121f" stroke="url(#${id}g)" stroke-width="2"/>
    <path d="M38 40q2-6 8-8" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  WD: (id) => `<defs>${GOLD(id + 'g')}
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4252"/><stop offset=".5" stop-color="#11141b"/><stop offset="1" stop-color="#05060a"/></linearGradient></defs>
    <path d="M32 6h36l26 26v36L68 94H32L6 68V32z" fill="url(#${id}g)"/>
    <path d="M33.5 10h33L90 33.5v33L66.5 90h-33L10 66.5v-33z" fill="url(#${id}s)"/>
    <path d="M35 15h30l20 20v30L65 85H35L15 65V35z" fill="none" stroke="#ffc93c" stroke-opacity=".45" stroke-width="1"/>
    <path d="M20 40 50 22 80 40" stroke="#38e8ff" stroke-opacity=".5" stroke-width="1.2" fill="none"/>
    <text x="50" y="59" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="21" letter-spacing="-.5"
      fill="url(#${id}g)" stroke="#2a1600" stroke-width="2.4" paint-order="stroke">WILD</text>
    <path d="M30 68h40" stroke="#ffc93c" stroke-width="1.4" opacity=".8"/>`,
  SW: (id) => `<defs>${GOLD(id + 'g')}
      <radialGradient id="${id}o" cx=".45" cy=".4"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9ff4ff"/><stop offset=".7" stop-color="#1aa8e0"/><stop offset="1" stop-color="#062a55"/></radialGradient>
      <radialGradient id="${id}h"><stop offset=".5" stop-color="#38e8ff" stop-opacity=".6"/><stop offset="1" stop-color="#38e8ff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#${id}h)"/>
    <circle cx="50" cy="50" r="31" fill="url(#${id}o)"/>
    <path d="M14 30l9 6-3 6 8 4M86 30l-9 6 3 6-8 4M20 80l9-7 4 4 6-6M80 80l-9-7-4 4-6-6" stroke="#e6fbff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="37" fill="none" stroke="url(#${id}g)" stroke-width="5"/>
    <ellipse cx="50" cy="50" rx="37" ry="11" fill="none" stroke="url(#${id}g)" stroke-width="2.4" transform="rotate(-28 50 50)"/>
    <ellipse cx="50" cy="50" rx="37" ry="11" fill="none" stroke="url(#${id}g)" stroke-width="2.4" transform="rotate(28 50 50)"/>
    <path d="M54.5 30 40 53h9.5l-4 18 16.5-24.5h-10z" fill="#ffffff" stroke="#0a4a7a" stroke-width="1.6" stroke-linejoin="round"/>`,
  SC: (id) => `<defs>${GOLD(id + 'g')}
      <linearGradient id="${id}r" x1="0" x2="1"><stop offset="0" stop-color="#3a0408"/><stop offset=".3" stop-color="#d1222f"/><stop offset=".45" stop-color="#ff5a52"/><stop offset=".7" stop-color="#b3121f"/><stop offset="1" stop-color="#2a0306"/></linearGradient>
      <radialGradient id="${id}d" cy=".4"><stop offset="0" stop-color="#fff6e0"/><stop offset="1" stop-color="#cdb98f"/></radialGradient></defs>
    <path d="M16 30q-5 22 0 44h68q5-22 0-44z" fill="url(#${id}r)"/>
    <path d="M16 30q-5 22 0 44M84 30q5 22 0 44" stroke="#1a0103" stroke-width="1.4" fill="none"/>
    <ellipse cx="50" cy="74" rx="34" ry="9" fill="#2a0306"/>
    <ellipse cx="50" cy="30" rx="35" ry="11" fill="url(#${id}g)"/>
    <ellipse cx="50" cy="29" rx="31" ry="9" fill="url(#${id}d)"/>
    <g transform="translate(50 29.5) scale(2.45 .72)">${mitsudomoe('#1a0a0b', '#ead9b4')}</g>
    <ellipse cx="50" cy="29" rx="26" ry="7.4" fill="none" stroke="#b3121f" stroke-opacity=".55" stroke-width=".8"/>
    <g fill="#ffd36b">${[22, 32, 42, 58, 68, 78].map((x) => `<circle cx="${x}" cy="${x < 50 ? 36 + (50 - x) * 0.08 : 36 + (x - 50) * 0.08}" r="1.8"/>`).join('')}</g>
    <rect x="18" y="66" width="64" height="20" rx="2" fill="url(#${id}g)" stroke="#5a3404" stroke-width="1"/>
    <rect x="21" y="69" width="58" height="14" rx="1" fill="none" stroke="#fff3c4" stroke-opacity=".6" stroke-width=".8"/>
    <text x="50" y="80.5" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="12.5" letter-spacing=".5" fill="#2a1200">BONUS</text>`,
};

/** Inline SVG markup of a symbol (unique gradient ids per call). */
export function symbolSvg(code: string): string {
  const id = `rs${++uid}`;
  const body = CARD[code] ? royal(code, id) : BODY[code]?.(id);
  if (!body) return `<svg viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="62" text-anchor="middle" font-family="Orbitron" font-weight="900" font-size="30" fill="#e9f3ff">${code}</text></svg>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}

/** Decorative mitsudomoe for UI chrome (currentColor). */
export const TOMOE_SVG = `<svg viewBox="-11 -11 22 22" aria-hidden="true">${mitsudomoe('currentColor')}</svg>`;

// ---------------------------------------------------------------- injectable symbol renders

const injected: Record<string, string> = {};

/**
 * Provide symbol images (data URLs, e.g. renders of the 3D symbols) keyed by
 * symbol code ('H1', 'SW', ...). Codes without an image use the SVG fallback.
 */
export function setSymbolIcons(map: Record<string, string>) {
  Object.assign(injected, map);
}

/** Markup for a symbol icon: the injected image if any, else the styled SVG. */
export function symbolIcon(code: string, cls = '', override?: Record<string, string>): string {
  const url = override?.[code] ?? injected[code];
  if (url) return `<span class="sym ${cls}" data-code="${code}"><img src="${url}" alt="" draggable="false"></span>`;
  return `<span class="sym sym-ph ${cls}" data-code="${code}">${symbolSvg(code)}</span>`;
}
