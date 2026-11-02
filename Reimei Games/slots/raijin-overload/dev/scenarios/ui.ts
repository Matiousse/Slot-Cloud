// UI preview: mounts the real HTML overlay (src/ui) over the 3D stage with a
// mock game state, and exposes helpers on window.__uiDemo to drive every state:
//
//   __uiDemo.splash()                 title overlay
//   __uiDemo.set({ ante: true, ... }) patch the mock UiState and re-render
//   __uiDemo.fsIntro(1|2|3)           free-spins intro banner (+ scene mode)
//   __uiDemo.fs(tier, cur, total, win) free-spins HUD
//   __uiDemo.bigWin(level, x?)        BIG(0) / MEGA(1) / EPIC(2) / LEGENDARY(3) count-up
//   __uiDemo.maxWin()  __uiDemo.retrigger()  __uiDemo.replayEnd()  __uiDemo.toast()
//
// URL extras: &lang=fr  &ui=<splash|idle|ante|buy|info|auto|fs1|fs2|fs3|big0..3|max|retrigger|hud1..3|error>
import '../../src/styles.css';
import type { Harness } from '../harness';
import { setLanguage, t, type Key } from '../../src/core/i18n';
import { setCurrency } from '../../src/core/format';
import { UI, type UiState } from '../../src/ui/ui';
import { buildSplash } from '../../src/ui/splash';
import { DEFAULT_JURISDICTION } from '../../src/net/backend';
import type { SceneMode } from '../../src/scene/contracts';

const MODES: SceneMode[] = ['base', 'overcharge', 'lock', 'god'];

export default async (h: Harness) => {
  const params = new URLSearchParams(location.search);
  setLanguage(params.get('lang') || 'en');
  setCurrency(params.get('cur') || 'EUR');
  // the harness debug label also uses id="hud": rename it so it doesn't clash with the UI
  const dbg = document.getElementById('hud');
  if (dbg) {
    dbg.id = 'harness-label';
    dbg.style.display = 'none';
  }
  // harness.html styles its debug #hud (fixed, monospace): undo that for the UI's #hud
  document.head.insertAdjacentHTML(
    'beforeend',
    '<style>#ui > #hud{position:absolute;left:calc(var(--bx) + var(--bs) / 2);top:var(--logo-y);font:inherit;color:inherit;text-shadow:none}</style>',
  );
  document.body.insertAdjacentHTML('beforeend', '<div id="ui"></div><div id="splash" class="splash hidden"></div>');
  const ui = new UI(document.getElementById('ui')!);
  const s: UiState = {
    balance: 10000,
    bet: 1,
    betIndex: 3,
    betCount: 20,
    ante: false,
    busy: false,
    spinning: false,
    autoLeft: 0,
    turbo: false,
    win: 0,
    winLabel: 'win',
    fs: null,
    replay: false,
    demo: true,
    net: 0,
    sessionStart: Date.now() - 754_000,
    jur: { ...DEFAULT_JURISDICTION, displayRTP: params.get('jur') === '1', displaySessionTimer: params.get('jur') === '1', displayNetPosition: params.get('jur') === '1' },
    sound: true,
  };
  const render = () => ui.render(s);
  ui.bind({
    spin: () => {
      s.spinning = !s.spinning;
      s.busy = s.spinning;
      render();
    },
    betUp: () => ((s.betIndex = Math.min(s.betCount - 1, s.betIndex + 1)), (s.bet = [0.1, 0.2, 0.5, 1, 2, 5, 10][Math.min(6, s.betIndex)] ?? 10), render()),
    betDown: () => ((s.betIndex = Math.max(0, s.betIndex - 1)), (s.bet = [0.1, 0.2, 0.5, 1, 2, 5, 10][Math.min(6, s.betIndex)] ?? 10), render()),
    toggleAnte: () => ((s.ante = !s.ante), render()),
    buy: () => undefined,
    autoStart: (n) => ((s.autoLeft = n), render()),
    autoStop: () => ((s.autoLeft = 0), render()),
    toggleTurbo: () => ((s.turbo = !s.turbo), render()),
    toggleSound: () => ((s.sound = !s.sound), render()),
    toggleSfx: () => undefined,
    toggleMusic: () => undefined,
    skip: () => undefined,
    replayAgain: () => undefined,
  });
  render();

  const setMode = (tier: number) => h.setMode(MODES[tier] ?? 'base');
  const fsHtml = (tier: number) =>
    `<div class="kicker">${t('scattersTrigger', { n: tier + 2 })}</div>
     <div class="title">${t(`tier${tier}` as Key)}</div>
     <div class="sub">${t('freeSpinsCount', { n: 10 })}</div>
     <p>${t(`tier${tier}Desc` as Key)}</p>
     <div class="tap">${t('continue')}</div>`;
  const TIERS: [number, Key][] = [
    [15, 'bigWin'],
    [50, 'megaWin'],
    [150, 'epicWin'],
    [500, 'legendaryWin'],
  ];

  const demo = {
    ui,
    state: s,
    set(patch: Partial<UiState>) {
      Object.assign(s, patch);
      render();
    },
    splash(loading = false) {
      const el = document.getElementById('splash')!;
      el.classList.remove('hidden');
      return buildSplash(el, { onPlay: () => undefined, playLabel: loading ? `${t('loading')}…` : t('play'), loading });
    },
    fsIntro(tier = 1) {
      setMode(tier);
      void ui.banner(`fs-intro tier${tier}`, fsHtml(tier));
    },
    fs(tier = 1, current = 3, total = 10, win = 12.3) {
      setMode(tier);
      s.fs = { tier, current, total, win };
      s.win = win;
      s.winLabel = 'totalWin';
      render();
    },
    /** Count up to `x` times the bet, upgrading the title like the controller. */
    bigWin(level = 0, x = [30, 90, 260, 900][level] ?? 30, ms = 1200) {
      const total = x * s.bet;
      void ui.banner(
        'win big',
        `<div class="title pop">${t('bigWin')}</div><div class="count">€0.00</div><div class="xbet"></div><div class="tap">${t('continue')}</div>`,
      );
      const start = performance.now();
      let shown = 0;
      return new Promise<void>((resolve) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / ms);
          const v = total * (1 - Math.pow(1 - k, 2.2));
          const node = ui.bannerCount();
          if (node) node.textContent = `€${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const curX = (v / total) * x;
          let ti = -1;
          for (let i = 0; i < TIERS.length; i++) if (curX >= TIERS[i][0]) ti = i;
          if (ti > shown && ti >= 0) {
            shown = ti;
            ui.setBannerTitle(t(TIERS[ti][1]));
          }
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    maxWin() {
      void ui.banner(
        'win max',
        `<div class="title pop">${t('maxWinReached')}</div><div class="count">€10,000.00</div><div class="xbet">10,000x</div><div class="tap">${t('continue')}</div>`,
      );
    },
    totalWin(x = 8.4) {
      void ui.banner(
        'win plain',
        `<div class="title pop">${t('totalWin')}</div><div class="count">€${x.toFixed(2)}</div><div class="xbet"></div><div class="tap">${t('continue')}</div>`,
      );
    },
    retrigger() {
      void ui.banner('retrigger', `<div class="title">${t('plusSpins', { n: 5 })}</div>`);
    },
    replayEnd() {
      void ui.banner('replay-end', `<div class="title small">${t('replayDone')}</div><button class="cta"><span>${t('replayAgain')}</span></button>`);
    },
    toast(text = t('resume')) {
      ui.toast(text, 60_000);
    },
  };
  (window as unknown as { __uiDemo: typeof demo }).__uiDemo = demo;

  // initial state from &ui=
  const st = params.get('ui') || 'idle';
  const click = (sel: string) => document.querySelector<HTMLElement>(sel)?.click();
  if (st === 'splash') demo.splash();
  else if (st === 'ante') demo.set({ ante: true });
  else if (st === 'buy') click('#btn-buy');
  else if (st === 'info') click('#btn-menu');
  else if (st === 'auto') click('#btn-auto');
  else if (st === 'autoon') demo.set({ autoLeft: 25, busy: true, spinning: true, win: 4.2 });
  else if (st === 'spinning') demo.set({ spinning: true, busy: true });
  else if (st === 'win') demo.set({ win: 12.5 });
  else if (/^fs\d$/.test(st)) demo.fsIntro(Number(st[2]));
  else if (/^hud\d$/.test(st)) demo.fs(Number(st[3]));
  else if (/^big\d$/.test(st)) void demo.bigWin(Number(st[3]));
  else if (st === 'max') demo.maxWin();
  else if (st === 'retrigger') (demo.fs(2, 7, 10, 48.6), demo.retrigger());
  else if (st === 'total') demo.totalWin();
  else if (st === 'replay') (demo.set({ replay: true, demo: false }), demo.replayEnd());
  else if (st === 'error') ui.error(t('errorGeneric'));
  else if (st === 'toast') demo.toast();
};
