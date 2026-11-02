// REIMEI GAMES studio intro (黎明 = "dawn"): a ~4.4 s logo sting shown before
// the game title. Pure SVG + canvas + Web Audio, no external assets, driven by
// a JS timeline so any frame can be rendered deterministically (?introAt=1.8).
//
//   playStudioIntro()                 -> resolves when the intro is gone
//   playStudioIntro({ sound: true })  -> also plays the audio sting (needs a user gesture)

import glyphs from './glyphs.json';
import { playSting } from './sting';

export interface IntroOptions {
  sound?: boolean;
  /** Freeze on this time (seconds) instead of playing — for previews/screenshots. */
  freezeAt?: number;
  /** Element to mount into (default: document.body). */
  parent?: HTMLElement;
  /** Keep the overlay mounted at the end (preview pages). */
  keep?: boolean;
}

const TOTAL = 4.4;
const HORIZON = 250;

// ---------------------------------------------------------------- easing

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const outCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const inOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const outBack = (k: number) => {
  const c1 = 2.2;
  return 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

// ---------------------------------------------------------------- markup

type Word = { glyphs: { d: string; x1: number; x2: number }[]; box: { x: number; y: number; w: number; h: number } };

function wordGroup(w: Word, id: string, cls: string) {
  return w.glyphs
    .map((g, i) => `<path id="${id}${i}" class="${cls}" d="${g.d}" pathLength="1"/>`)
    .join('');
}

const STYLE = `
.rm-intro{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#040306;overflow:hidden;cursor:pointer;
  -webkit-tap-highlight-color:transparent;user-select:none}
.rm-intro canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.rm-intro .rm-grain{position:absolute;inset:-50%;pointer-events:none;opacity:.07;mix-blend-mode:screen}
.rm-intro .rm-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,transparent 35%,rgba(0,0,0,.75) 100%)}
.rm-intro svg{position:relative;width:min(94vw,1100px,150vh);height:auto;overflow:visible}
@media (max-aspect-ratio:4/5){.rm-intro svg{width:124vw;max-width:none;margin:0 -12vw}}
.rm-intro .rm-flash{position:absolute;inset:0;background:#fff4dc;opacity:0;pointer-events:none}
.rm-intro .rm-skip{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));
  font:600 11px/1 system-ui,sans-serif;letter-spacing:.22em;color:rgba(255,236,200,.38);text-transform:uppercase}
`;

function buildSvg() {
  const R = glyphs.reimei as Word;
  const G = glyphs.games as Word;
  const K = glyphs.kanji as Word;
  // wordmark placement (viewBox 1000 x 600)
  const rs = 520 / R.box.w;
  const rx = 500 - (R.box.x + R.box.w / 2) * rs;
  const rBase = HORIZON + 40 + R.box.h * rs; // baseline
  const gs = 270 / G.box.w;
  const gx = 500 - (G.box.x + G.box.w / 2) * gs;
  const gBase = rBase + 34 + G.box.h * gs;
  // hanko seal, vertical 黎 / 明
  const sealX = 500 + 260 + 18;
  const sealY = HORIZON + 40;
  const sealS = 84;
  const ks = 0.34;
  const k0 = K.glyphs[0];
  const k1 = K.glyphs[1];
  const kTx = (g: { x1: number; x2: number }) => sealS / 2 - ((g.x1 + g.x2) / 2) * ks;
  const rays = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    const w = 0.035 + (i % 3) * 0.012;
    const L = 900;
    const p = (ang: number) => `${(Math.cos(ang) * L).toFixed(1)},${(Math.sin(ang) * L).toFixed(1)}`;
    return `<polygon points="0,0 ${p(a - w)} ${p(a + w)}" opacity="${(0.22 + (i % 4) * 0.1).toFixed(2)}"/>`;
  }).join('');
  const shimmer = Array.from({ length: 4 }, (_, i) => {
    const y = HORIZON + 8 + i * 6.5 + i * i * 0.8;
    const w = 250 - i * 40;
    return `<rect class="rm-shim" data-i="${i}" x="${500 - w / 2}" y="${y.toFixed(1)}" width="${w}" height="${(2 - i * 0.35).toFixed(2)}" rx="1" opacity="${(1 - i * 0.22).toFixed(2)}"/>`;
  }).join('');
  // thin cloud bands crossing the rising sun (classic Japanese dawn motif)
  const bands = [
    [HORIZON - 34, 2.6, 300],
    [HORIZON - 58, 1.6, 220],
    [HORIZON - 18, 1.2, 380],
  ]
    .map(([y, h, w], i) => `<rect class="rm-band" data-i="${i}" x="${500 - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`)
    .join('');

  return `
<svg viewBox="0 0 1000 600" aria-label="Reimei Games" role="img">
  <defs>
    <radialGradient id="rm-sun" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff3d2"/><stop offset=".3" stop-color="#ffc46b"/><stop offset=".62" stop-color="#ff7a2e"/>
      <stop offset=".88" stop-color="#e2361f"/><stop offset="1" stop-color="#9a0f1c"/>
    </radialGradient>
    <radialGradient id="rm-sky" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ff7a2e" stop-opacity=".85"/><stop offset=".3" stop-color="#c0182a" stop-opacity=".38"/>
      <stop offset=".65" stop-color="#3a0a3a" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rm-ray" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(620)">
      <stop offset=".12" stop-color="#ffd9a0" stop-opacity=".42"/><stop offset=".55" stop-color="#ff7a2e" stop-opacity=".12"/><stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rm-line" x1="0" x2="1">
      <stop offset="0" stop-color="#ffb347" stop-opacity="0"/><stop offset=".25" stop-color="#ffc93c"/><stop offset=".5" stop-color="#ffffff"/>
      <stop offset=".75" stop-color="#ffc93c"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rm-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#ffe7a8"/><stop offset=".52" stop-color="#f2b33d"/>
      <stop offset=".56" stop-color="#9a5a0a"/><stop offset=".78" stop-color="#e09a1a"/><stop offset="1" stop-color="#ffe08a"/>
    </linearGradient>
    <linearGradient id="rm-sheen" x1="0" x2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rm-refl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="rm-above"><rect x="-200" y="-400" width="1400" height="${HORIZON + 400}"/></clipPath>
    <clipPath id="rm-sunclip"><circle cx="500" cy="${HORIZON}" r="118"/></clipPath>
    <clipPath id="rm-below"><rect x="-200" y="${HORIZON}" width="1400" height="800"/></clipPath>
    <clipPath id="rm-wordclip"><g transform="translate(${rx.toFixed(2)} ${rBase.toFixed(2)}) scale(${rs.toFixed(4)})">${R.glyphs.map((g) => `<path d="${g.d}"/>`).join('')}</g></clipPath>
    <filter id="rm-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="rm-blur-big" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="rm-ink" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/>
    </filter>
  </defs>

  <ellipse id="rm-skyglow" cx="500" cy="${HORIZON}" rx="640" ry="300" fill="url(#rm-sky)" opacity="0"/>

  <g clip-path="url(#rm-above)">
    <g id="rm-rays" transform="translate(500 ${HORIZON})" fill="url(#rm-ray)" opacity="0">${rays}</g>
    <g id="rm-sungroup">
      <circle cx="500" cy="${HORIZON}" r="150" fill="#ff6a2a" filter="url(#rm-blur-big)" opacity=".7"/>
      <circle id="rm-sundisc" cx="500" cy="${HORIZON}" r="118" fill="url(#rm-sun)"/>
      <g id="rm-bands" fill="#2a0612" opacity=".55" clip-path="url(#rm-sunclip)">${bands}</g>
    </g>
  </g>

  <g clip-path="url(#rm-below)">
    <ellipse id="rm-refl" cx="500" cy="${HORIZON + 6}" rx="190" ry="70" fill="url(#rm-refl)" filter="url(#rm-blur)" opacity="0"/>
    <g id="rm-shimmer" fill="#ffc46b" opacity="0">${shimmer}</g>
  </g>

  <g id="rm-horizon" transform="translate(500 ${HORIZON})">
    <rect x="-380" y="-5" width="760" height="10" fill="url(#rm-line)" filter="url(#rm-blur)" opacity=".85"/>
    <rect x="-380" y="-1.2" width="760" height="2.4" fill="url(#rm-line)"/>
  </g>

  <g id="rm-logo">
    <g transform="translate(${rx.toFixed(2)} ${rBase.toFixed(2)}) scale(${rs.toFixed(4)})">
      <g id="rm-word-shadow" fill="none" stroke="#000" stroke-opacity=".75" stroke-width="7" stroke-linejoin="round" opacity="0">
        ${R.glyphs.map((g) => `<path d="${g.d}"/>`).join('')}
      </g>
      <g id="rm-word-fill" fill="url(#rm-gold)">${wordGroup(R, 'rm-wf', 'rm-wfill')}</g>
      <g id="rm-word-stroke" fill="none" stroke="#ffe7a8" stroke-width="1.6" stroke-linejoin="round">${wordGroup(R, 'rm-ws', 'rm-wstroke')}</g>
    </g>
    <rect id="rm-sheen" x="-200" y="${(rBase - R.box.h * rs - 10).toFixed(1)}" width="140" height="${(R.box.h * rs + 20).toFixed(1)}"
      fill="url(#rm-sheen)" clip-path="url(#rm-wordclip)" style="mix-blend-mode:screen" opacity="0"/>
    <g id="rm-games" transform="translate(${gx.toFixed(2)} ${gBase.toFixed(2)}) scale(${gs.toFixed(4)})" fill="#f6e7c9">
      ${G.glyphs.map((g, i) => `<path id="rm-g${i}" d="${g.d}" data-cx="${((g.x1 + g.x2) / 2).toFixed(2)}"/>`).join('')}
    </g>
    <g id="rm-seal" transform="translate(${sealX} ${sealY})" opacity="0">
      <g id="rm-seal-inner">
        <g filter="url(#rm-ink)">
          <rect width="${sealS}" height="${sealS}" rx="7" fill="#c8261c"/>
          <rect x="5" y="5" width="${sealS - 10}" height="${sealS - 10}" rx="4" fill="none" stroke="#fff3e8" stroke-width="2.2"/>
          <g fill="#fff3e8">
            <path d="${k0.d}" transform="translate(${kTx(k0).toFixed(2)} 40) scale(${ks})"/>
            <path d="${k1.d}" transform="translate(${kTx(k1).toFixed(2)} 72.5) scale(${ks})"/>
          </g>
        </g>
        <g id="rm-splats" fill="#c8261c" opacity="0">
          <circle cx="-9" cy="12" r="2.6"/><circle cx="${sealS + 7}" cy="9" r="1.8"/><circle cx="${sealS + 11}" cy="${sealS - 14}" r="2.8"/>
          <circle cx="-6" cy="${sealS - 6}" r="1.6"/><circle cx="${sealS / 2}" cy="${sealS + 9}" r="2"/>
        </g>
      </g>
    </g>
  </g>
</svg>`;
}

// ---------------------------------------------------------------- particles

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  hue: number;
}

function grainDataUrl() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// ---------------------------------------------------------------- main

let styleInjected = false;

export function playStudioIntro(opts: IntroOptions = {}): Promise<void> {
  if (!styleInjected) {
    const st = document.createElement('style');
    st.textContent = STYLE;
    document.head.appendChild(st);
    styleInjected = true;
  }
  const root = document.createElement('div');
  root.className = 'rm-intro';
  root.setAttribute('role', 'presentation');
  root.innerHTML = `<canvas></canvas><div class="rm-grain"></div>${buildSvg()}<div class="rm-vignette"></div><div class="rm-flash"></div>
    ${opts.freezeAt === undefined ? '<div class="rm-skip">Tap to skip</div>' : ''}`;
  (opts.parent ?? document.body).appendChild(root);

  const $ = <T extends Element = SVGElement>(sel: string) => root.querySelector(sel) as T;
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const svg = root.querySelector('svg')!;
  const grain = $<HTMLDivElement>('.rm-grain');
  grain.style.backgroundImage = `url(${grainDataUrl()})`;
  const flash = $<HTMLDivElement>('.rm-flash');
  const sky = $('#rm-skyglow');
  const rays = $('#rm-rays');
  const sunGroup = $('#rm-sungroup');
  const sun = $('#rm-sundisc');
  const refl = $('#rm-refl');
  const shimmer = $('#rm-shimmer');
  const shims = Array.from(root.querySelectorAll<SVGRectElement>('.rm-shim'));
  const bands = Array.from(root.querySelectorAll<SVGRectElement>('.rm-band'));
  const horizon = $('#rm-horizon');
  const shadow = $('#rm-word-shadow');
  const strokes = Array.from(root.querySelectorAll<SVGPathElement>('.rm-wstroke'));
  const fills = Array.from(root.querySelectorAll<SVGPathElement>('.rm-wfill'));
  const sheen = $('#rm-sheen');
  const games = Array.from(root.querySelectorAll<SVGPathElement>('#rm-games path'));
  const gamesCenter = (glyphs.games.box.x + glyphs.games.box.w / 2);
  const seal = $('#rm-seal');
  const sealInner = $('#rm-seal-inner');
  const splats = $('#rm-splats');
  const logo = $('#rm-logo');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // canvas sizing
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  // svg -> screen mapping for the horizon (particles spawn there)
  const toScreen = (x: number, y: number) => {
    const r = svg.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const s = r.width / 1000;
    return { x: r.left - rr.left + x * s, y: r.top - rr.top + y * s, s };
  };

  const motes: Mote[] = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spawn = (t: number) => {
    const p = toScreen(320 + rnd() * 360, HORIZON);
    motes.push({
      x: p.x,
      y: p.y - rnd() * 6 * p.s,
      vx: (rnd() - 0.5) * 14,
      vy: -(14 + rnd() * 40) * (0.6 + p.s),
      life: 0,
      max: 1.6 + rnd() * 1.8,
      r: (0.8 + rnd() * 2.2) * Math.max(0.6, p.s * 1.4),
      hue: 28 + rnd() * 22 + (t > 2 ? 6 : 0),
    });
  };

  let sealHit = false;

  const render = (t: number, dt: number) => {
    // horizon line draws out from the centre
    const hl = outCubic(seg(t, 0.15, 0.85));
    horizon.setAttribute('transform', `translate(500 ${HORIZON}) scale(${Math.max(0.001, hl)} 1)`);
    horizon.setAttribute('opacity', String(Math.min(1, hl * 1.4)));

    // sun rises and blooms
    const rise = outCubic(seg(t, 0.4, 1.6));
    sunGroup.setAttribute('transform', `translate(0 ${((1 - rise) * 140).toFixed(2)})`);
    const flare = seg(t, 3.7, 4.15);
    sun.setAttribute('r', String(118 + flare * 30));
    sky.setAttribute('opacity', String(0.15 + rise * 0.85 + flare * 0.3));
    rays.setAttribute('opacity', String(seg(t, 0.9, 1.7) * (0.9 + 0.1 * Math.sin(t * 3)) + flare * 0.5));
    rays.setAttribute('transform', `translate(500 ${HORIZON}) rotate(${(t * 6).toFixed(2)})`);
    refl.setAttribute('opacity', String(seg(t, 0.7, 1.6) * 0.8));
    shimmer.setAttribute('opacity', String(seg(t, 0.8, 1.7) * 0.7));
    shims.forEach((r, i) => r.setAttribute('transform', `translate(${(Math.sin(t * 2.2 + i * 1.7) * (6 + i * 2)).toFixed(2)} 0)`));
    bands.forEach((r, i) => r.setAttribute('transform', `translate(${((i % 2 ? -1 : 1) * (t * 9 + i * 20)).toFixed(2)} 0)`));

    // wordmark: stroke draw-on, then metallic fill
    strokes.forEach((p, i) => {
      const k = inOutCubic(seg(t, 1.0 + i * 0.08, 1.75 + i * 0.08));
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = String(1 - k);
      p.style.opacity = String(k > 0 ? 1 - seg(t, 2.3, 2.9) * 0.6 : 0);
    });
    fills.forEach((p, i) => p.setAttribute('opacity', String(outCubic(seg(t, 1.45 + i * 0.06, 2.05 + i * 0.06)))));
    shadow.setAttribute('opacity', String(seg(t, 1.45, 2.1)));
    const sh = seg(t, 2.35, 3.15);
    sheen.setAttribute('opacity', String(sh > 0 && sh < 1 ? 1 : 0));
    sheen.setAttribute('x', String(150 + inOutCubic(sh) * 700));

    // GAMES: tracking opens from the centre
    const gk = outCubic(seg(t, 1.8, 2.5));
    games.forEach((p) => {
      const cx = Number(p.dataset.cx);
      const off = (cx - gamesCenter) * (1 - gk) * -0.35;
      p.setAttribute('transform', `translate(${off.toFixed(2)} 0)`);
      p.setAttribute('opacity', String(gk));
    });

    // hanko seal stamps in
    const sk = seg(t, 2.1, 2.36);
    seal.setAttribute('opacity', String(sk > 0 ? 1 : 0));
    const sc = sk >= 1 ? 1 : 1.9 - 0.9 * outBack(sk);
    const rot = -14 + 10 * outCubic(sk);
    sealInner.setAttribute('transform', `translate(42 42) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(3)}) translate(-42 -42)`);
    splats.setAttribute('opacity', String(seg(t, 2.34, 2.42) * (1 - seg(t, 3.3, 3.9) * 0.4)));
    const shake = t > 2.34 && t < 2.6 ? (1 - seg(t, 2.34, 2.6)) * 3 : 0;
    logo.setAttribute('transform', shake ? `translate(${(Math.sin(t * 90) * shake).toFixed(2)} ${(Math.cos(t * 70) * shake).toFixed(2)})` : '');
    if (t >= 2.34 && !sealHit) {
      sealHit = true;
      const p = toScreen(500 + 260 + 18 + 42, HORIZON + 82);
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2;
        motes.push({ x: p.x, y: p.y, vx: Math.cos(a) * 120 * p.s * 2, vy: Math.sin(a) * 120 * p.s * 2, life: 0, max: 0.5 + rnd() * 0.4, r: 1.6 * Math.max(0.6, p.s * 1.4), hue: 8 });
      }
    }

    // ending: flare + fade
    flash.style.opacity = String(seg(t, 3.75, 4.0) * 0.55 * (1 - seg(t, 4.0, 4.4)));
    root.style.opacity = String(1 - seg(t, 4.05, TOTAL));

    // embers on canvas
    if (dt > 0) {
      const rate = t > 0.9 && t < 4.1 ? 38 : 0;
      for (let i = 0; i < rate * dt; i++) spawn(t);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.life += dt;
      if (m.life >= m.max) {
        motes.splice(i, 1);
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 1 - dt * 0.6;
      const a = Math.sin((m.life / m.max) * Math.PI) * (0.6 + 0.4 * Math.sin(m.life * 23 + i));
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 3);
      g.addColorStop(0, `hsla(${m.hue},100%,80%,${a})`);
      g.addColorStop(1, `hsla(${m.hue},100%,50%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(m.x - m.r * 3, m.y - m.r * 3, m.r * 6, m.r * 6);
    }
    ctx.globalCompositeOperation = 'source-over';
    grain.style.transform = `translate(${((t * 977) % 64) - 32}px, ${((t * 613) % 64) - 32}px)`;
  };

  // deterministic preview frame
  if (opts.freezeAt !== undefined) {
    const target = Math.min(opts.freezeAt, TOTAL);
    let t = 0;
    while (t < target) {
      const dt = Math.min(1 / 30, target - t);
      t += dt;
      render(t, dt);
    }
    render(target, 0);
    root.style.opacity = '1';
    return Promise.resolve();
  }

  if (opts.sound) playSting();

  return new Promise((resolve) => {
    let t = reduced ? 3.2 : 0;
    let last = performance.now();
    let ending = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      if (!opts.keep) root.remove();
      resolve();
    };
    const skip = () => {
      if (ending) return;
      ending = true;
      t = Math.max(t, 4.05);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    root.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', onKey);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      render(Math.min(t, TOTAL), dt);
      if (t >= TOTAL) return finish();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
