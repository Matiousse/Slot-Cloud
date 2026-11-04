// PIZZA RUSH — Reimei Games. Démarrage : polices, intro du studio, chargement, écran d'accueil, jeu.
import './styles.css';
import { audio } from './audio/audio';
import { setCurrency } from './core/format';
import { Game } from './game/controller';
import { loadAllRigs } from './game/rigs';
import { Stage } from './game/stage';
import { DemoBackend } from './net/demo';
import { RgsBackend, fetchReplay, type Backend } from './net/backend';
import { Hud } from './ui/hud';
import { TARGET_RTP, WINCAP_X } from '../shared/game';
import { playStudioIntro } from '../../../intro/studio-intro';

const params = new URLSearchParams(location.search);
const q = (k: string) => params.get(k) ?? '';

async function loadFonts() {
  const faces = [
    new FontFace('Modak', 'url(fonts/modak-latin-400-normal.woff2)'),
    new FontFace('Luckiest Guy', 'url(fonts/luckiest-guy-latin-400-normal.woff2)'),
    new FontFace('Lilita One', 'url(fonts/lilita-one-latin-400-normal.woff2)'),
  ];
  await Promise.race([
    Promise.all(faces.map(async (f) => document.fonts.add(await f.load()))),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
}

function splashHtml(el: HTMLElement) {
  el.innerHTML = `
    <div class="inner">
      <img class="logo" src="img/logo.png" alt="PIZZA RUSH">
      <div class="cards">
        <div class="sc"><img src="anims/WD/corps.webp" alt=""><h3>RUSH HOUR</h3><p>Tony speeds by and drops up to 4 Golden Slice Wilds</p></div>
        <div class="sc"><img src="anims/SC/corps.webp" alt=""><h3>FREE SPINS</h3><p>3, 4 or 5 Phone Orders: Lunch, Dinner or Midnight Rush</p></div>
        <div class="sc"><img src="anims/H1/corps.webp" alt=""><h3>TIP JAR</h3><p>Every Wild adds a tip: multiplier up to x100, never resets</p></div>
      </div>
      <div class="max">MAX WIN ${WINCAP_X.toLocaleString('en-US')}x · RTP ${(TARGET_RTP * 100).toFixed(2)}%</div>
      <div class="bar-load"><i></i></div>
      <button class="cta" disabled>LOADING…</button>
    </div>`;
}

async function boot() {
  const rgsUrl = q('rgs_url');
  const sessionID = q('sessionID');
  const isReplay = q('replay') === 'true';
  const splash = document.getElementById('splash')!;
  await loadFonts();
  splashHtml(splash);
  const bar = splash.querySelector<HTMLElement>('.bar-load i')!;
  const cta = splash.querySelector<HTMLButtonElement>('.cta')!;
  // intro du studio par-dessus le chargement (pas pour les replays)
  const intro = !isReplay && q('nointro') !== '1' ? playStudioIntro() : Promise.resolve();

  const stage = await Stage.create(document.getElementById('stage')!, () => loadAllRigs((k) => (bar.style.width = `${Math.round(k * 100)}%`)));

  let backend: Backend;
  if (isReplay)
    backend = {
      kind: 'replay',
      authenticate: () => Promise.reject(new Error('replay')),
      play: () => Promise.reject(new Error('replay')),
      endRound: () => Promise.resolve(0),
      saveEvent: () => Promise.resolve(),
    };
  else if (rgsUrl && sessionID) backend = new RgsBackend(rgsUrl, sessionID);
  else backend = new DemoBackend(q('currency') || 'EUR', q('demo_force'));

  let game!: Game;
  const hud = new Hud(document.getElementById('hud')!, {
    spin: () => game.spin(),
    bet: (d) => game.changeBet(d),
    ante: (on) => game.setAnte(on),
    buy: (m) => game.buy(m),
    turbo: (on) => game.setTurbo(on),
    auto: (n) => game.setAuto(n),
    sound: (on) => audio.setEnabled(on),
  });
  game = new Game(backend, hud, stage);

  let resumeRound = null as Awaited<ReturnType<Game['init']>>['round'];
  let replayRound = null as Awaited<ReturnType<typeof fetchReplay>> | null;
  try {
    if (isReplay) {
      replayRound = await fetchReplay(rgsUrl, q('game'), q('version'), q('mode'), q('event'));
      if (!replayRound.amount) replayRound.amount = Number(q('amount')) || 1_000_000;
      setCurrency(q('currency') || 'USD');
    } else {
      const auth = await game.init(q('lang') || 'en');
      setCurrency(auth.currency);
      game.refresh();
      resumeRound = auth.round;
    }
    cta.disabled = false;
    cta.textContent = isReplay ? 'REPLAY' : 'PLAY';
  } catch (e: any) {
    console.error(e);
    cta.textContent = e?.code === 'ERR_IS' || e?.code === 'ERR_ATE' ? 'SESSION EXPIRED' : 'CONNECTION ERROR';
  }
  bar.style.width = '100%';
  await intro;

  cta.addEventListener('click', async () => {
    audio.unlock();
    audio.setMusic('base');
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 600);
    if (replayRound) await game.resume(replayRound);
    else if (resumeRound?.active) await game.resume(resumeRound);
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
}

void boot();
