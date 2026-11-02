// Cinematic title overlay shown over the 3D intro: metallic RAIJIN + neon
// OVERLOAD, a huge faint 雷 behind, the three key features, max win / RTP and
// the PLAY button. The background is mostly transparent so Raijin powering up
// in the 3D scene shows through.

import './fonts';
import { WINCAP_X } from '../../shared/game';
import summary from '../../shared/math-summary.json';
import { t } from '../core/i18n';
import { ICONS, symbolIcon } from './icons';

export interface SplashOptions {
  /** Symbol renders (data URLs) keyed by code; falls back to setSymbolIcons() / SVG. */
  icons?: Record<string, string>;
  /** Called once when PLAY is pressed (the overlay then fades out and removes itself). */
  onPlay: () => void;
  playLabel: string;
  /** Start with the PLAY button disabled (e.g. while authenticating); enable with setReady(). */
  loading?: boolean;
}

export interface SplashHandle {
  readonly play: HTMLButtonElement;
  /** Enable / disable PLAY and optionally change its label. */
  setReady(ready: boolean, label?: string): void;
  /** Fade out and remove the overlay (also done automatically on PLAY). */
  dismiss(): void;
}

/** Thunder Hunt emblem: hexagon reactor with a bolt and "x5". */
const HUNT_EMBLEM = `<span class="emblem"><svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="spHg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".4" stop-color="#ffc93c"/><stop offset=".55" stop-color="#8a5208"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
    <radialGradient id="spHc" cy=".42"><stop offset="0" stop-color="#bff6ff"/><stop offset=".45" stop-color="#1aa8e0"/><stop offset="1" stop-color="#04182a"/></radialGradient>
    <radialGradient id="spHh"><stop offset=".45" stop-color="#ffc93c" stop-opacity=".45"/><stop offset="1" stop-color="#ffc93c" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#spHh)"/>
  <path d="M50 6 88 28v44L50 94 12 72V28z" fill="url(#spHg)"/>
  <path d="M50 12 83 31v38L50 88 17 69V31z" fill="url(#spHc)"/>
  <path d="M50 12 83 31v38L50 88 17 69V31z" fill="none" stroke="#e6fbff" stroke-opacity=".5" stroke-width="1"/>
  <path d="M55 18 34 52h13l-5 26 22-36H51z" fill="#fff" stroke="#38e8ff" stroke-width="1.5" stroke-linejoin="round"/>
  <g transform="translate(66 74)"><rect x="-15" y="-10" width="30" height="20" rx="2" fill="#120a02" stroke="url(#spHg)" stroke-width="2"/>
  <text y="6" text-anchor="middle" font-family="Orbitron, sans-serif" font-weight="900" font-size="15" fill="#ffd36b">x5</text></g>
</svg></span>`;

export function buildSplash(el: HTMLElement, opts: SplashOptions): SplashHandle {
  const icon = (code: string) => symbolIcon(code, '', opts.icons);
  const maxX = `${WINCAP_X.toLocaleString('en-US')}x`;
  const rtp = `${(summary.targetRtp * 100).toFixed(2)}%`;
  el.classList.add('splash');
  el.classList.remove('out');
  el.innerHTML = `
    <div class="sp-sun"></div>
    <div class="sp-shade"></div>
    <div class="sp-kanji" aria-hidden="true">雷</div>
    <div class="sp-inner">
      <div class="sp-logo">
        <div class="sp-kicker"><i></i><b>雷神</b><span>${t('tagline')}</span><i></i></div>
        <h1 class="sp-raijin" data-text="RAIJIN">RAIJIN</h1>
        <div class="sp-overload">OVERLOAD</div>
      </div>
      <div class="sp-cards">
        <div class="sp-card">${icon('SW')}<h3>${t('stormWild')}</h3><p>${t('stormWildDesc')}</p><em>×2 – ×100</em></div>
        <div class="sp-card">${icon('SC')}<h3>${t('bonusGames')}</h3><p>${t('bonusGamesDesc')}</p><em>${t('tier1')} · ${t('tier2')} · ${t('tier3')}</em></div>
        <div class="sp-card">${HUNT_EMBLEM}<h3>${t('bonusHunt')}</h3><p>${t('bonusHuntDesc')}</p><em>${t('bonusHuntShort')}</em></div>
      </div>
      <div class="sp-max"><span>${t('maxWin')}</span><b>${maxX}</b><i></i><span>RTP</span><b>${rtp}</b></div>
      <button class="cta sp-play"${opts.loading ? ' disabled' : ''}><span>${opts.playLabel}</span>${ICONS.bolt}</button>
    </div>`;
  const play = el.querySelector<HTMLButtonElement>('.sp-play')!;
  const label = play.querySelector('span')!;
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 650);
  };
  play.addEventListener('click', (e) => {
    e.stopPropagation();
    if (play.disabled || gone) return;
    opts.onPlay();
    dismiss();
  });
  return {
    play,
    setReady(ready, text) {
      play.disabled = !ready;
      if (text !== undefined) label.textContent = text;
    },
    dismiss,
  };
}
