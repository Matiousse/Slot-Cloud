// DOM user interface: control bar, feature panel, free-spins HUD, banners and
// modals, themed for RAIJIN OVERLOAD (see docs/ART_DIRECTION.md).
//
// Public surface used by src/game/controller.ts and src/main.ts (kept stable):
//   ids  #btn-spin #btn-plus #btn-minus #btn-auto #btn-turbo #btn-sound #btn-menu
//        #btn-buy #btn-ante #balance #win #win-lbl #bet #bet-sub #hud #banner
//        #toast #modal #badge #footer
//   API  render() banner() bannerCount() setBannerTitle() hideBanner() toast()
//        openModal() closeModal() modalOpen error() openInfo() musicOn sfxOn

import './fonts';
import { MODES, PAYLINES, PAYTABLE, S, WINCAP_X, type SymbolCode } from '../../shared/game';
import summary from '../../shared/math-summary.json';
import { t, type Key } from '../core/i18n';
import { money } from '../core/format';
import { ICONS, TOMOE_SVG, symbolIcon } from './icons';
import type { Jurisdiction } from '../net/backend';

export { setSymbolIcons, symbolIcon } from './icons';

export interface UiState {
  balance: number; // currency units
  bet: number; // base bet, currency units
  betIndex: number;
  betCount: number;
  ante: boolean;
  busy: boolean;
  spinning: boolean;
  autoLeft: number; // 0 = off, Infinity = until stopped
  turbo: boolean;
  win: number;
  winLabel: Key;
  fs: { tier: number; current: number; total: number; win: number } | null;
  replay: boolean;
  demo: boolean;
  net: number;
  sessionStart: number;
  jur: Jurisdiction;
  sound: boolean;
}

export interface UiHandlers {
  spin(): void;
  betUp(): void;
  betDown(): void;
  toggleAnte(): void;
  buy(mode: string): void;
  autoStart(n: number, stopOnFeature: boolean): void;
  autoStop(): void;
  toggleTurbo(): void;
  toggleSound(): void;
  toggleSfx(): void;
  toggleMusic(): void;
  skip(): void;
  replayAgain(): void;
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const X = (v: number) => `${v.toLocaleString('en-US')}x`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Orbitron has proportional digits (the "1" is half as wide), so counting
 * numbers wobble. Each digit is boxed in a fixed-width cell instead.
 */
function setNum(el: HTMLElement | null, text: string) {
  if (!el || el.dataset.v === text) return;
  el.dataset.v = text;
  el.innerHTML = esc(text).replace(/\d/g, '<i>$&</i>');
}

/** Make `el.textContent = '€12.30'` (used by the controller's count-ups) render tabular digits. */
function tabular(el: HTMLElement) {
  const initial = el.textContent ?? '';
  el.classList.add('num');
  Object.defineProperty(el, 'textContent', {
    configurable: true,
    get: () => el.dataset.v ?? '',
    set: (v: unknown) => setNum(el, String(v ?? '')),
  });
  setNum(el, initial);
}

/** Kanji accents (all present in the bundled 'Raijin Kanji' subset, see fonts.ts). */
const WIN_KANJI = ['大', '嵐', '鬼', '神'];
const TIER_KANJI: Record<string, string> = { '1': '電', '2': '雷', '3': '神' };
const WIN_KEYS: Key[] = ['bigWin', 'megaWin', 'epicWin', 'legendaryWin'];

export class UI {
  root: HTMLElement;
  private h!: UiHandlers;
  private s!: UiState;
  private bannerResolve: (() => void) | null = null;
  private timer = 0;
  private toastTimer = 0;
  private lastWin = 0;
  private countTimer = 0;
  private spinIcon = '';
  private soundIcon = '';

  private q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = this.root) => root.querySelector(sel) as T;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div id="hud" class="hud hidden">
        <div class="hud-plate">
          <i class="hud-wing l"></i><i class="hud-wing r"></i>
          <div class="hud-tier"></div>
          <div class="hud-row">
            <div class="hud-spins"><span class="lbl"></span><b class="num"></b><span class="hud-bar"><i></i></span></div>
            <div class="hud-win"><span class="lbl"></span><b class="num"></b></div>
          </div>
        </div>
      </div>
      <div id="features" class="features">
        <button id="btn-buy" class="feat feat-buy">
          <span class="feat-edge"><i></i></span><span class="feat-fill"></span><span class="feat-sheen"></span>
          <span class="feat-ico">${symbolIcon('SC')}</span>
          <span class="feat-txt"><span class="feat-title"></span><span class="feat-sub"></span><span class="feat-price"></span></span>
          <span class="feat-corner"></span>
        </button>
        <button id="btn-ante" class="feat feat-ante" aria-pressed="false">
          <span class="feat-edge"><i></i></span><span class="feat-fill"></span><span class="feat-sheen"></span>
          <span class="feat-ico bolt">${ICONS.bolt}</span>
          <span class="feat-txt"><span class="feat-title"></span><span class="feat-sub"></span><span class="feat-cost"></span></span>
          <span class="switch"><i></i></span>
          <span class="feat-corner"></span>
        </button>
      </div>
      <div id="bar" class="bar">
        <div class="bar-bg"><i class="bar-line"></i><i class="bar-spark"></i></div>
        <button id="btn-menu" class="sys-btn" aria-label="menu">${ICONS.menu}</button>
        <button id="btn-sound" class="sys-btn" aria-label="sound">${ICONS.soundOn}</button>
        <div class="readouts">
          <div class="readout bal"><span class="lbl" data-t="balance"></span><b id="balance" class="num"></b></div>
          <div class="readout win"><i class="win-plate"></i><i class="win-flash"></i><span class="lbl" id="win-lbl"></span><b id="win" class="num"></b></div>
          <div class="readout bet"><span class="lbl" data-t="bet"></span><b id="bet" class="num"></b><small id="bet-sub"></small></div>
        </div>
        <button id="btn-minus" class="ctl-btn small" aria-label="bet down">${ICONS.minus}</button>
        <button id="btn-plus" class="ctl-btn small" aria-label="bet up">${ICONS.plus}</button>
        <button id="btn-auto" class="ctl-btn" aria-label="autoplay">${ICONS.auto}<span class="auto-count"></span></button>
        <button id="btn-spin" class="spin-btn" aria-label="spin">
          <span class="spin-halo"></span>
          <span class="spin-bezel"></span>
          <span class="spin-ticks"></span>
          <span class="spin-arcs"></span>
          <span class="spin-core"></span>
          <span class="spin-icon">${ICONS.spin}</span>
        </button>
        <button id="btn-turbo" class="ctl-btn" aria-label="turbo">${ICONS.turbo}</button>
      </div>
      <div id="footer" class="footer"></div>
      <div id="badge" class="badge hidden"></div>
      <div id="banner" class="banner hidden"></div>
      <div id="toast" class="toast hidden"></div>
      <div id="modal" class="modal hidden"><div class="modal-card"><i class="mc-top"></i><i class="mc-kanji">雷</i><button class="modal-close" aria-label="close">${ICONS.close}</button><div class="modal-body"></div></div></div>
    `;
    this.spinIcon = ICONS.spin;
    this.soundIcon = ICONS.soundOn;
    this.root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t as Key)));
    this.q('#btn-buy .feat-title').textContent = t('buyBonus');
    this.q('#btn-buy .feat-sub').textContent = `${t('tier1')} · ${t('tier2')}`;
    this.q('#btn-ante .feat-title').textContent = t('bonusHunt');
    this.q('#btn-ante .feat-sub').textContent = t('bonusHuntShort');
    this.q('.hud-spins .lbl').textContent = t('freeSpins');
    this.q('.hud-win .lbl').textContent = t('bonusWin');
    this.q('#btn-auto').title = t('autoplay');
    this.q('#btn-turbo').title = t('turbo');
    this.q('#modal .modal-close').addEventListener('click', () => this.closeModal());
    this.q('#modal').addEventListener('click', (e) => {
      if (e.target === this.q('#modal')) this.closeModal();
    });
  }

  bind(h: UiHandlers) {
    this.h = h;
    const tap = (id: string, fn: () => void) =>
      this.q(id).addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
    tap('#btn-spin', () => h.spin());
    tap('#btn-plus', () => h.betUp());
    tap('#btn-minus', () => h.betDown());
    tap('#btn-ante', () => h.toggleAnte());
    tap('#btn-buy', () => this.openBuy());
    tap('#btn-auto', () => (this.s.autoLeft > 0 ? h.autoStop() : this.openAuto()));
    tap('#btn-turbo', () => h.toggleTurbo());
    tap('#btn-sound', () => h.toggleSound());
    tap('#btn-menu', () => this.openInfo());
    // press feedback (spin disc slams, ripples)
    const spin = this.q('#btn-spin');
    spin.addEventListener('pointerdown', () => {
      spin.classList.remove('press');
      void spin.offsetWidth;
      spin.classList.add('press');
    });
    this.q('#banner').addEventListener('click', () => {
      if (this.bannerResolve) {
        const r = this.bannerResolve;
        this.bannerResolve = null;
        r();
      } else h.skip();
    });
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.updateFooter(), 1000);
  }

  // ------------------------------------------------------------ state

  render(s: UiState) {
    this.s = s;
    const cost = s.bet * (s.ante ? 3 : 1);
    setNum(this.q('#balance'), money(s.balance));
    setNum(this.q('#bet'), money(cost));
    this.q('#bet-sub').textContent = s.ante ? `${money(s.bet)} ×3` : '';
    setNum(this.q('#win'), money(s.win));
    const winLbl = t(s.winLabel);
    if (this.q('#win-lbl').textContent !== winLbl) this.q('#win-lbl').textContent = winLbl;
    const winBox = this.q('.readout.win');
    winBox.classList.toggle('has-win', s.win > 0);
    if (s.win > 0 && this.lastWin === 0) {
      // fresh win: flash + pop once
      winBox.classList.remove('hit');
      void winBox.offsetWidth;
      winBox.classList.add('hit');
    }
    if (s.win > this.lastWin && this.lastWin > 0) {
      // counting up: steady glow while the value keeps rising
      winBox.classList.add('counting');
      window.clearTimeout(this.countTimer);
      this.countTimer = window.setTimeout(() => winBox.classList.remove('counting'), 220);
    }
    this.lastWin = s.win;
    const locked = s.busy || s.replay;
    (this.q('#btn-plus') as HTMLButtonElement).disabled = locked || s.betIndex >= s.betCount - 1 || s.autoLeft > 0;
    (this.q('#btn-minus') as HTMLButtonElement).disabled = locked || s.betIndex <= 0 || s.autoLeft > 0;
    const buy = this.q<HTMLButtonElement>('#btn-buy');
    buy.disabled = locked || s.autoLeft > 0 || s.ante;
    buy.classList.toggle('hidden', s.jur.disabledBuyFeature);
    const cheapest = Math.min(...MODES.filter((m) => m.kind === 'buy').map((m) => m.cost));
    this.q('#btn-buy .feat-price').textContent = t('buyFrom', { x: money(s.bet * cheapest) });
    const ante = this.q<HTMLButtonElement>('#btn-ante');
    ante.disabled = locked || s.autoLeft > 0;
    ante.classList.toggle('on', s.ante);
    ante.setAttribute('aria-pressed', String(s.ante));
    this.q('#btn-ante .feat-cost').textContent = `${t('bet')} ${money(s.bet * 3)}`;
    const spin = this.q<HTMLButtonElement>('#btn-spin');
    spin.classList.toggle('spinning', s.spinning);
    spin.classList.toggle('auto', s.autoLeft > 0);
    const icon = s.autoLeft > 0 ? ICONS.stop : ICONS.spin;
    if (icon !== this.spinIcon) {
      this.spinIcon = icon;
      this.q('#btn-spin .spin-icon').innerHTML = icon;
    }
    spin.disabled = s.replay || (s.busy && !s.spinning && s.autoLeft === 0);
    spin.classList.toggle('busy', s.busy && !s.spinning && s.autoLeft === 0);
    const auto = this.q<HTMLButtonElement>('#btn-auto');
    auto.classList.toggle('hidden', s.jur.disabledAutoplay);
    auto.classList.toggle('on', s.autoLeft > 0);
    auto.disabled = s.replay || (s.busy && s.autoLeft === 0);
    this.q('#btn-auto .auto-count').textContent = s.autoLeft > 0 ? (Number.isFinite(s.autoLeft) ? String(s.autoLeft) : '∞') : '';
    const turbo = this.q<HTMLButtonElement>('#btn-turbo');
    turbo.classList.toggle('hidden', s.jur.disabledTurbo);
    turbo.classList.toggle('on', s.turbo);
    const sIcon = s.sound ? ICONS.soundOn : ICONS.soundOff;
    if (sIcon !== this.soundIcon) {
      this.soundIcon = sIcon;
      this.q('#btn-sound').innerHTML = sIcon;
    }
    this.q('#btn-sound').classList.toggle('off', !s.sound);
    // free-spins HUD
    const hud = this.q('#hud');
    hud.classList.toggle('hidden', !s.fs);
    if (s.fs) {
      const tier = t(`tier${s.fs.tier}` as Key);
      if (this.q('.hud-tier').textContent !== tier) this.q('.hud-tier').textContent = tier;
      setNum(this.q('.hud-spins b'), `${s.fs.current} / ${s.fs.total}`);
      setNum(this.q('.hud-win b'), money(s.fs.win));
      this.q('.hud-bar i').style.transform = `scaleX(${s.fs.total ? Math.min(1, s.fs.current / s.fs.total) : 0})`;
      hud.dataset.tier = String(s.fs.tier);
    }
    const badge = this.q('#badge');
    badge.classList.toggle('hidden', !s.replay && !s.demo);
    badge.textContent = s.replay ? t('replay') : t('demo');
    const body = document.body;
    body.classList.toggle('fs', !!s.fs);
    body.classList.toggle('replay', s.replay);
    body.classList.toggle('ante', s.ante);
    body.classList.toggle('spinning', s.spinning);
    body.dataset.tier = s.fs ? String(s.fs.tier) : '0';
    this.updateFooter();
  }

  private updateFooter() {
    const s = this.s;
    if (!s) return;
    const parts: string[] = [];
    if (s.jur.displaySessionTimer) {
      const sec = Math.floor((Date.now() - s.sessionStart) / 1000);
      const hh = Math.floor(sec / 3600);
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      parts.push(`<span><em>${t('session')}</em> ${hh ? hh + ':' : ''}${mm}:${ss}</span>`);
    }
    if (s.jur.displayNetPosition) parts.push(`<span><em>${t('netPosition')}</em> ${esc(money(s.net))}</span>`);
    if (s.jur.displayRTP) parts.push(`<span><em>${t('rtp')}</em> ${pct(summary.targetRtp)}</span>`);
    const html = parts.join('');
    const f = this.q('#footer');
    if (f.innerHTML !== html) f.innerHTML = html;
  }

  // ------------------------------------------------------------ banners / toasts

  toast(text: string, ms = 2200) {
    const el = this.q('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.add('hidden'), ms);
  }

  /**
   * Show a centered banner. Resolves on tap, or after `autoMs` if given.
   * `html` may contain an element with class "count" that the caller animates.
   * Kinds used by the controller: `fs-intro tierN`, `retrigger`, `win big|max|plain`, `replay-end`.
   */
  banner(kind: string, html: string, autoMs?: number): Promise<void> {
    const el = this.q('#banner');
    const tier = /tier(\d)/.exec(kind)?.[1];
    const isWin = /\bwin\b/.test(kind);
    const kanji = tier ? TIER_KANJI[tier] ?? '雷' : /\bmax\b/.test(kind) ? '天' : isWin ? '大' : /retrigger/.test(kind) ? '雷' : '';
    el.className = `banner ${kind}`;
    el.removeAttribute('data-level');
    el.innerHTML = `
      <div class="banner-fx"><i class="b-glow"></i><i class="b-rays"></i><i class="b-rays b2"></i><i class="b-ring"></i><i class="b-streak"></i><i class="b-streak s2"></i></div>
      ${kanji ? `<div class="banner-kanji">${kanji}</div>` : ''}
      <div class="banner-inner">${html}</div>`;
    const title = this.q('.title', el);
    if (isWin && title) {
      // wrap the title so the kanji seal anchors to its top-right corner
      const wrap = document.createElement('div');
      wrap.className = 'title-wrap';
      title.replaceWith(wrap);
      wrap.append(title);
      wrap.insertAdjacentHTML('beforeend', `<div class="stamp"><span>${kanji}</span></div>`);
    }
    const count = this.q('.count', el);
    if (count) tabular(count);
    const tap = this.q('.tap', el);
    if (tap) tap.insertAdjacentHTML('afterbegin', `<span class="tap-chev">${ICONS.chevron}</span>`);
    if (isWin) this.applyWinLevel(this.q('.title', el)?.textContent ?? '');
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.bannerResolve = null;
        resolve();
      };
      this.bannerResolve = finish;
      if (autoMs !== undefined) window.setTimeout(finish, autoMs);
    });
  }

  /** BIG / MEGA / EPIC / LEGENDARY escalate the banner styling (data-level 0..3) and swap the kanji stamp. */
  private applyWinLevel(title: string) {
    const el = this.q('#banner');
    if (!el.classList.contains('big')) return;
    const level = WIN_KEYS.findIndex((k) => t(k) === title);
    if (level < 0) return;
    const prev = el.dataset.level;
    el.dataset.level = String(level);
    const k = WIN_KANJI[level];
    const stamp = this.q('.stamp', el);
    const big = this.q('.banner-kanji', el);
    if (stamp) {
      this.q('span', stamp).textContent = k;
      if (prev !== undefined) {
        stamp.classList.remove('restamp');
        void stamp.offsetWidth;
        stamp.classList.add('restamp');
      }
    }
    if (big) big.textContent = k;
    if (prev !== undefined && prev !== String(level)) {
      el.classList.remove('level-up');
      void el.offsetWidth;
      el.classList.add('level-up');
    }
  }

  bannerCount(): HTMLElement | null {
    return this.q('#banner .count');
  }

  setBannerTitle(text: string) {
    const el = this.q('#banner .title');
    if (el && el.textContent !== text) {
      el.textContent = text;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      this.applyWinLevel(text);
    }
  }

  hideBanner() {
    const el = this.q('#banner');
    el.className = 'banner hidden';
    el.removeAttribute('data-level');
    this.bannerResolve = null;
  }

  // ------------------------------------------------------------ modals

  openModal(html: string, cls = '') {
    const m = this.q('#modal');
    m.className = `modal ${cls}`;
    const body = this.q('.modal-body', m);
    body.innerHTML = html;
    body.scrollTop = 0;
    return body;
  }

  closeModal() {
    this.q('#modal').className = 'modal hidden';
  }

  get modalOpen() {
    return !this.q('#modal').classList.contains('hidden');
  }

  error(message: string, reload = false) {
    const body = this.openModal(
      `<div class="m-head"><span class="m-tag">ERR</span><h2>${t('errorTitle')}</h2></div><p class="center">${message}</p><div class="actions"><button class="cta" id="err-ok"><span>${reload ? t('reload') : t('ok')}</span></button></div>`,
      'small error',
    );
    this.q('#err-ok', body).addEventListener('click', () => (reload ? location.reload() : this.closeModal()));
  }

  private openBuy() {
    const s = this.s;
    const buys = MODES.filter((m) => m.kind === 'buy');
    const cards = buys
      .map((m) => {
        const price = s.bet * m.cost;
        const tier = m.tier!;
        const rtp = (summary.modes as Record<string, { rtp: number }>)[m.name]?.rtp ?? summary.targetRtp;
        return `
        <div class="buy-card tier${tier}">
          <i class="bc-tomoe">${TOMOE_SVG}</i>
          <div class="buy-art">${symbolIcon('SC', 'a')}${symbolIcon('SW', 'b')}</div>
          <div class="bc-tag">${t('drumsCount', { n: tier + 2 })}</div>
          <h3>${t(`tier${tier}` as Key)}</h3>
          <p>${t(`tier${tier}Desc` as Key)}</p>
          <div class="buy-meta"><span><b>${X(m.cost)}</b></span><span>RTP ${pct(rtp)}</span></div>
          <button class="cta" data-mode="${m.name}" ${price > s.balance ? 'disabled' : ''}><span>${t('buyFor', { x: money(price) })}</span></button>
        </div>`;
      })
      .join('');
    const body = this.openModal(`<div class="m-head"><span class="m-tag">BONUS</span><h2>${t('buyBonus')}</h2></div><div class="buy-grid">${cards}</div>`, 'wide buy');
    body.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        const mode = MODES.find((m) => m.name === b.dataset.mode)!;
        const confirmBody = this.openModal(
          `<div class="confirm tier${mode.tier}">
             <div class="buy-art">${symbolIcon('SC', 'a')}${symbolIcon('SW', 'b')}</div>
             <h2>${t(`tier${mode.tier}` as Key)}</h2>
             <p class="center big num-line">${t('buyFor', { x: money(this.s.bet * mode.cost) })}</p>
           </div>
           <div class="actions"><button class="ghost" id="buy-no"><span>${t('cancel')}</span></button><button class="cta" id="buy-yes"><span>${t('confirm')}</span></button></div>`,
          'small',
        );
        this.q('#buy-no', confirmBody).addEventListener('click', () => this.openBuy());
        this.q('#buy-yes', confirmBody).addEventListener('click', () => {
          this.closeModal();
          this.h.buy(mode.name);
        });
      }),
    );
  }

  private openAuto() {
    const opts = [10, 25, 50, 100, 500, Infinity];
    let pick = 25;
    const body = this.openModal(
      `<div class="m-head"><span class="m-tag">AUTO</span><h2>${t('autoplay')}</h2></div>
       <p class="center lead">${t('autoplaySpins')}</p>
       <div class="chips">${opts.map((n) => `<button class="chip${n === pick ? ' on' : ''}" data-n="${n}"><span>${Number.isFinite(n) ? n : '∞'}</span></button>`).join('')}</div>
       <label class="check"><input type="checkbox" id="auto-stop" checked><span>${t('stopOnFeature')}</span></label>
       <div class="actions"><button class="cta" id="auto-go"><span>${t('startAuto')}</span></button></div>`,
      'small auto',
    );
    body.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) =>
      c.addEventListener('click', () => {
        pick = Number(c.dataset.n);
        body.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      }),
    );
    this.q('#auto-go', body).addEventListener('click', () => {
      const stop = (this.q('#auto-stop', body) as HTMLInputElement).checked;
      this.closeModal();
      this.h.autoStart(pick, stop);
    });
  }

  openInfo() {
    const s = this.s;
    const order: SymbolCode[] = ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4', 'L5'];
    const pay = order
      .map((code, i) => {
        const row = PAYTABLE[S[code]];
        const cells = [5, 4, 3]
          .map((n) => {
            const x = row[n - 3] / 100;
            return `<div><b>${n}</b><span>${X(x)}</span><small>${money(x * s.bet)}</small></div>`;
          })
          .join('');
        return `<div class="pay${i < 4 ? ' high' : ''}">${symbolIcon(code)}<div class="pay-rows">${cells}</div></div>`;
      })
      .join('');
    const lines = PAYLINES.map(
      (l, i) =>
        `<div class="pl"><span>${String(i + 1).padStart(2, '0')}</span><div class="pl-grid">${Array.from({ length: 25 }, (_, k) => {
          const reel = k % 5;
          const row = Math.floor(k / 5);
          return `<i class="${l[reel] === row ? 'on' : ''}"></i>`;
        }).join('')}</div></div>`,
    ).join('');
    const modeNames: Record<string, Key> = { base: 'modeBase', ante: 'modeAnte', bonus: 'modeBonus', super: 'modeSuper' };
    const modes = MODES.filter((m) => !(s.jur.disabledBuyFeature && m.kind === 'buy'))
      .map((m) => {
        const ms = (summary.modes as Record<string, { rtp: number; cost: number }>)[m.name];
        return `<tr><td>${t(modeNames[m.name] ?? 'modeBase')}</td><td>${X(m.cost)}</td><td>${pct(ms?.rtp ?? summary.targetRtp)}</td><td>${X(WINCAP_X)}</td></tr>`;
      })
      .join('');
    const feature = (img: SymbolCode, title: string, text: string, cls = '') =>
      `<div class="feature ${cls}">${symbolIcon(img)}<div><h3>${title}</h3><p>${text}</p></div></div>`;
    const sec = (title: string, inner: string, cls = '') =>
      `<section class="${cls}"><h2 class="sec"><i></i><span>${title}</span><i></i></h2>${inner}</section>`;
    const toggle = (id: string, label: string, on: boolean) =>
      `<label class="check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
    const body = this.openModal(
      `<div class="m-head"><span class="m-tag">INFO</span><h2>${t('info')}</h2></div>
      <section class="settings">
        ${toggle('set-sfx', t('sound'), s.sound)}
        ${toggle('set-music', t('music'), false)}
        ${s.jur.disabledTurbo ? '' : toggle('set-turbo', t('turboSetting'), s.turbo)}
      </section>
      <section class="hero-sec">
        <div class="hero">
          <div><small>${t('maxWin')}</small><b>${X(WINCAP_X)}</b></div>
          <div><small>RTP</small><b>${pct(summary.targetRtp)}</b></div>
          <div><small>${t('volatility').split(':')[0]}</small><b class="vol"><i></i><i></i><i></i><i></i><i></i></b></div>
        </div>
        ${feature('SW', t('stormWild'), t('rulesStorm'), 'sw')}
        ${feature('WD', 'WILD', t('rulesWild'))}
        ${feature('SC', 'BONUS', `${t('rulesBonus')} ${t('rulesRetrigger')}`, 'sc')}
        <div class="tiers">
          <div class="tier tier1"><i class="tk">${TIER_KANJI['1']}</i><b>3 × BONUS</b><h3>${t('tier1')}</h3><p>${t('tier1Desc')}</p></div>
          <div class="tier tier2"><i class="tk">${TIER_KANJI['2']}</i><b>4 × BONUS</b><h3>${t('tier2')}</h3><p>${t('tier2Desc')}</p></div>
          <div class="tier tier3"><i class="tk">${TIER_KANJI['3']}</i><b>5 × BONUS</b><h3>${t('tier3')}</h3><p>${t('tier3Desc')}</p></div>
        </div>
        <div class="note hunt"><span class="ni">${ICONS.bolt}</span><p>${t('rulesHunt')}</p></div>
        ${s.jur.disabledBuyFeature ? '' : `<div class="note buy"><span class="ni">${ICONS.plus}</span><p>${t('rulesBuy')}</p></div>`}
      </section>
      ${sec(t('paytable'), `<div class="paytable">${pay}</div>`)}
      ${sec(t('paylines'), `<p>${t('rulesGeneral')}</p><div class="paylines">${lines}</div>`)}
      ${sec(
        t('rulesModes'),
        `<table class="modes"><thead><tr><th>${t('rulesMode')}</th><th>${t('rulesCost')}</th><th>RTP</th><th>${t('rulesMaxWin')}</th></tr></thead><tbody>${modes}</tbody></table>
        <p>${t('rulesRtp')}: ${pct(summary.targetRtp)}. ${t('rulesRtpAll', { x: pct(summary.targetRtp) })}</p><p>${t('rulesMax', { x: X(WINCAP_X) })}</p>`,
      )}
      ${sec(t('rulesTitle'), `<p>${t('rulesControls')}</p><p class="muted">${t('rulesMalfunction')}</p><p class="muted ver">RAIJIN OVERLOAD · v${summary.version} · © Reimei Games</p>`)}`,
      'wide info',
    );
    const music = this.q('#set-music', body) as HTMLInputElement;
    music.checked = this.musicOn();
    (this.q('#set-sfx', body) as HTMLInputElement).checked = this.sfxOn();
    this.q('#set-sfx', body).addEventListener('change', () => this.h.toggleSfx());
    music.addEventListener('change', () => this.h.toggleMusic());
    this.q('#set-turbo', body)?.addEventListener('change', () => this.h.toggleTurbo());
  }

  musicOn: () => boolean = () => true;
  sfxOn: () => boolean = () => true;
}
