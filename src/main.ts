import '@fontsource/luckiest-guy/400.css';
import '@fontsource/lilita-one/400.css';
import './styles.css';

import { WINCAP_X } from '../shared/game';
import summary from '../shared/math-summary.json';
import { audio } from './audio/audio';
import { setCurrency } from './core/format';
import { setLanguage, t } from './core/i18n';
import { Game } from './game/controller';
import { DemoBackend } from './net/demo';
import { RgsBackend, fetchReplay, type Backend, type AuthResult } from './net/backend';
import { renderLogo, renderSymbol } from './render/art';
import { Renderer } from './render/renderer';
import { UI } from './ui/ui';

const params = new URLSearchParams(location.search);
const q = (k: string) => params.get(k) ?? '';

async function boot() {
  const rgsUrl = q('rgs_url');
  const sessionID = q('sessionID');
  const isReplay = q('replay') === 'true';
  const social = q('social') === 'true';
  setLanguage(q('lang') === 'br' ? 'pt' : q('lang') || 'en', social);

  // fonts must be ready before symbols/logo are rasterised
  try {
    await Promise.race([
      Promise.all([document.fonts.load('64px "Luckiest Guy"'), document.fonts.load('32px "Lilita One"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  const ui = new UI(document.getElementById('ui')!);

  let backend: Backend;
  if (isReplay) {
    backend = {
      kind: 'replay',
      authenticate: () => Promise.reject(new Error('replay')),
      play: () => Promise.reject(new Error('replay')),
      endRound: () => Promise.resolve(0),
      saveEvent: () => Promise.resolve(),
    };
  } else if (rgsUrl && sessionID) backend = new RgsBackend(rgsUrl, sessionID);
  else backend = new DemoBackend(q('currency') || 'EUR', q('demo_force'));

  const game = new Game(backend, ui, renderer);
  const splash = document.getElementById('splash')!;
  buildSplash(splash);
  const playBtn = splash.querySelector<HTMLButtonElement>('.cta')!;

  let auth: AuthResult | null = null;
  try {
    if (isReplay) {
      const round = await fetchReplay(rgsUrl, q('game'), q('version'), q('mode'), q('event'));
      if (!round.amount) round.amount = Number(q('amount')) || 1_000_000;
      setCurrency(q('currency') || 'USD');
      game.setReplay(round);
    } else {
      auth = await game.init(q('lang') || 'en');
      setCurrency(auth.currency);
      if (auth.jurisdiction.socialCasino) setLanguage(q('lang') || 'en', true);
    }
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    ui.error(code === 'ERR_IS' || code === 'ERR_ATE' ? t('errorSession') : t('errorGeneric'), true);
  }
  playBtn.disabled = false;
  playBtn.textContent = isReplay ? t('replay') : t('play');
  game.refresh();

  playBtn.addEventListener('click', async () => {
    audio.unlock();
    audio.setMusic('base');
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 600);
    if (isReplay) return void game.playReplay();
    if (auth?.round?.active) await game.resume(auth.round);
  });
  // first interaction anywhere also unlocks audio (mobile browsers)
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  // tapping the game area skips animations
  canvas.addEventListener('pointerdown', () => {
    if (game.state.busy) game.skip();
  });
}

function buildSplash(el: HTMLElement) {
  const logo = renderLogo(Math.min(900, window.innerWidth * 0.9) * Math.min(2, devicePixelRatio || 1)).toDataURL();
  const img = (code: Parameters<typeof renderSymbol>[0]) => renderSymbol(code, 160).toDataURL();
  el.innerHTML = `
    <div class="splash-inner">
      <img class="splash-logo" src="${logo}" alt="CLOUDBURST">
      <div class="splash-cards">
        <div class="scard"><img src="${img('SW')}" alt=""><h3>${t('stormWild')}</h3><p>${t('stormWildDesc')}</p></div>
        <div class="scard"><img src="${img('SC')}" alt=""><h3>3 ${t('freeSpins')}</h3><p>${t('tier1')} · ${t('tier2')} · ${t('tier3')}</p></div>
        <div class="scard hunt"><img src="${img('H1')}" alt=""><h3>${t('bonusHunt')}</h3><p>${t('bonusHuntDesc')}</p></div>
      </div>
      <div class="splash-max">${t('maxWinLine', { x: `${WINCAP_X.toLocaleString('en-US')}x` })} · RTP ${(summary.targetRtp * 100).toFixed(2)}%</div>
      <button class="cta" disabled>${t('loading')}…</button>
    </div>`;
}

void boot();
