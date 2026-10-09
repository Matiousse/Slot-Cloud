// DOM user interface: control bar, feature panel, HUD, banners and modals.

import { MODES, PAYLINES, PAYTABLE, S, WINCAP_X, type SymbolCode } from '../../shared/game';
import summary from '../../shared/math-summary.json';
import { renderSymbol } from '../render/art';
import { t, type Key } from '../core/i18n';
import { money } from '../core/format';
import { ICONS } from './icons';
import type { Jurisdiction } from '../net/backend';

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

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const symbolImg = (() => {
  const cache = new Map<string, string>();
  return (code: SymbolCode, px = 112) => {
    const key = code + px;
    if (!cache.has(key)) cache.set(key, renderSymbol(code, px).toDataURL());
    return cache.get(key)!;
  };
})();

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const X = (v: number) => `${v.toLocaleString('en-US')}x`;

export class UI {
  root: HTMLElement;
  private h!: UiHandlers;
  private s!: UiState;
  private bannerResolve: (() => void) | null = null;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div id="hud" class="hud hidden">
        <div class="hud-tier"></div>
        <div class="hud-row"><div class="hud-spins"><span class="lbl"></span><b></b></div><div class="hud-win"><span class="lbl"></span><b></b></div></div>
      </div>
      <div id="features" class="features">
        <button id="btn-buy" class="feat feat-buy"><span class="feat-title"></span><span class="feat-sub">STORM CHASE · EYE OF THE STORM</span></button>
        <button id="btn-ante" class="feat feat-ante" aria-pressed="false">
          <span class="feat-title"></span>
          <span class="feat-sub"></span>
          <span class="feat-cost"></span>
          <span class="switch"><i></i></span>
        </button>
      </div>
      <div id="bar" class="bar">
        <div class="bar-left">
          <button id="btn-menu" class="icon-btn" aria-label="menu">${ICONS.menu}</button>
          <button id="btn-sound" class="icon-btn" aria-label="sound">${ICONS.soundOn}</button>
        </div>
        <div class="readouts">
          <div class="readout"><span class="lbl" data-t="balance"></span><b id="balance"></b></div>
          <div class="readout win"><span class="lbl" id="win-lbl"></span><b id="win"></b></div>
          <div class="readout bet"><span class="lbl" data-t="bet"></span><b id="bet"></b><small id="bet-sub"></small></div>
        </div>
        <div class="controls">
          <button id="btn-minus" class="round-btn small" aria-label="bet down">${ICONS.minus}</button>
          <button id="btn-auto" class="round-btn" aria-label="autoplay">${ICONS.auto}<span class="auto-count"></span></button>
          <button id="btn-spin" class="spin-btn" aria-label="spin">${ICONS.spin}</button>
          <button id="btn-turbo" class="round-btn" aria-label="turbo">${ICONS.turbo}</button>
          <button id="btn-plus" class="round-btn small" aria-label="bet up">${ICONS.plus}</button>
        </div>
      </div>
      <div id="footer" class="footer"></div>
      <div id="badge" class="badge hidden"></div>
      <div id="banner" class="banner hidden"></div>
      <div id="toast" class="toast hidden"></div>
      <div id="modal" class="modal hidden"><div class="modal-card"><button class="modal-close" aria-label="close">${ICONS.close}</button><div class="modal-body"></div></div></div>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t as Key)));
    $('#btn-buy .feat-title').textContent = t('buyBonus');
    $('#btn-ante .feat-title').textContent = t('bonusHunt');
    $('#btn-ante .feat-sub').textContent = t('bonusHuntShort');
    $('.hud-spins .lbl').textContent = t('freeSpins');
    $('.hud-win .lbl').textContent = t('bonusWin');
    $('#modal .modal-close').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (e) => {
      if (e.target === $('#modal')) this.closeModal();
    });
  }

  bind(h: UiHandlers) {
    this.h = h;
    const tap = (id: string, fn: () => void) =>
      $(id).addEventListener('click', (e) => {
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
    $('#banner').addEventListener('click', () => {
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
    $('#balance').textContent = money(s.balance);
    $('#bet').textContent = money(cost);
    $('#bet-sub').textContent = s.ante ? `${money(s.bet)} x3` : '';
    $('#win').textContent = money(s.win);
    $('#win-lbl').textContent = t(s.winLabel);
    const locked = s.busy || s.replay;
    ($('#btn-plus') as HTMLButtonElement).disabled = locked || s.betIndex >= s.betCount - 1 || s.autoLeft > 0;
    ($('#btn-minus') as HTMLButtonElement).disabled = locked || s.betIndex <= 0 || s.autoLeft > 0;
    const buy = $('#btn-buy') as HTMLButtonElement;
    buy.disabled = locked || s.autoLeft > 0 || s.ante;
    buy.classList.toggle('hidden', s.jur.disabledBuyFeature);
    const ante = $('#btn-ante') as HTMLButtonElement;
    ante.disabled = locked || s.autoLeft > 0;
    ante.classList.toggle('on', s.ante);
    ante.setAttribute('aria-pressed', String(s.ante));
    $('#btn-ante .feat-cost').textContent = `${t('bet')} ${money(s.bet * 3)}`;
    const spin = $('#btn-spin');
    spin.classList.toggle('spinning', s.spinning);
    spin.classList.toggle('auto', s.autoLeft > 0);
    spin.innerHTML = s.autoLeft > 0 ? ICONS.stop : ICONS.spin;
    ($('#btn-spin') as HTMLButtonElement).disabled = s.replay || (s.busy && !s.spinning && s.autoLeft === 0);
    const auto = $('#btn-auto') as HTMLButtonElement;
    auto.classList.toggle('hidden', s.jur.disabledAutoplay);
    auto.classList.toggle('on', s.autoLeft > 0);
    auto.disabled = s.replay || (s.busy && s.autoLeft === 0);
    $('#btn-auto .auto-count').textContent = s.autoLeft > 0 ? (Number.isFinite(s.autoLeft) ? String(s.autoLeft) : '∞') : '';
    const turbo = $('#btn-turbo') as HTMLButtonElement;
    turbo.classList.toggle('hidden', s.jur.disabledTurbo);
    turbo.classList.toggle('on', s.turbo);
    $('#btn-sound').innerHTML = s.sound ? ICONS.soundOn : ICONS.soundOff;
    // HUD
    const hud = $('#hud');
    hud.classList.toggle('hidden', !s.fs);
    if (s.fs) {
      $('.hud-tier').textContent = t(`tier${s.fs.tier}` as Key);
      $('.hud-spins b').textContent = `${s.fs.current} / ${s.fs.total}`;
      $('.hud-win b').textContent = money(s.fs.win);
      hud.dataset.tier = String(s.fs.tier);
    }
    const badge = $('#badge');
    badge.classList.toggle('hidden', !s.replay && !s.demo);
    badge.textContent = s.replay ? t('replay') : t('demo');
    document.body.classList.toggle('fs', !!s.fs);
    document.body.classList.toggle('replay', s.replay);
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
      parts.push(`${t('session')} ${hh ? hh + ':' : ''}${mm}:${ss}`);
    }
    if (s.jur.displayNetPosition) parts.push(`${t('netPosition')} ${money(s.net)}`);
    if (s.jur.displayRTP) parts.push(`${t('rtp')} ${pct(summary.targetRtp)}`);
    $('#footer').textContent = parts.join('   ·   ');
  }

  // ------------------------------------------------------------ banners / toasts

  toast(text: string, ms = 2200) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    window.setTimeout(() => el.classList.add('hidden'), ms);
  }

  /**
   * Show a centered banner. Resolves on tap, or after `autoMs` if given.
   * `html` may contain an element with class "count" that the caller animates.
   */
  banner(kind: string, html: string, autoMs?: number): Promise<void> {
    const el = $('#banner');
    el.className = `banner ${kind}`;
    el.innerHTML = `<div class="banner-inner">${html}</div>`;
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

  bannerCount(): HTMLElement | null {
    return $('#banner .count');
  }

  setBannerTitle(text: string) {
    const el = $('#banner .title');
    if (el && el.textContent !== text) {
      el.textContent = text;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  }

  hideBanner() {
    $('#banner').className = 'banner hidden';
    this.bannerResolve = null;
  }

  // ------------------------------------------------------------ modals

  openModal(html: string, cls = '') {
    const m = $('#modal');
    m.className = `modal ${cls}`;
    $('.modal-body', m).innerHTML = html;
    $('.modal-body', m).scrollTop = 0;
    return $('.modal-body', m);
  }

  closeModal() {
    $('#modal').className = 'modal hidden';
  }

  get modalOpen() {
    return !$('#modal').classList.contains('hidden');
  }

  error(message: string, reload = false) {
    const body = this.openModal(
      `<h2>${t('errorTitle')}</h2><p class="center">${message}</p><div class="actions"><button class="cta" id="err-ok">${reload ? t('reload') : t('ok')}</button></div>`,
      'small',
    );
    $('#err-ok', body).addEventListener('click', () => (reload ? location.reload() : this.closeModal()));
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
          <div class="buy-art"><img src="${symbolImg('SC')}" alt=""><img src="${symbolImg('SW')}" alt=""></div>
          <h3>${t(`tier${tier}` as Key)}</h3>
          <p>${t(`tier${tier}Desc` as Key)}</p>
          <div class="buy-meta">${X(m.cost)} · RTP ${pct(rtp)}</div>
          <button class="cta" data-mode="${m.name}" ${price > s.balance ? 'disabled' : ''}>${t('buyFor', { x: money(price) })}</button>
        </div>`;
      })
      .join('');
    const body = this.openModal(`<h2>${t('buyBonus')}</h2><div class="buy-grid">${cards}</div>`, 'wide');
    body.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        const mode = MODES.find((m) => m.name === b.dataset.mode)!;
        const confirmBody = this.openModal(
          `<h2>${t(`tier${mode.tier}` as Key)}</h2>
           <p class="center big">${t('buyFor', { x: money(this.s.bet * mode.cost) })}</p>
           <div class="actions"><button class="ghost" id="buy-no">${t('cancel')}</button><button class="cta" id="buy-yes">${t('confirm')}</button></div>`,
          'small',
        );
        $('#buy-no', confirmBody).addEventListener('click', () => this.openBuy());
        $('#buy-yes', confirmBody).addEventListener('click', () => {
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
      `<h2>${t('autoplay')}</h2>
       <p class="center">${t('autoplaySpins')}</p>
       <div class="chips">${opts.map((n) => `<button class="chip${n === pick ? ' on' : ''}" data-n="${n}">${Number.isFinite(n) ? n : '∞'}</button>`).join('')}</div>
       <label class="check"><input type="checkbox" id="auto-stop" checked> ${t('stopOnFeature')}</label>
       <div class="actions"><button class="cta" id="auto-go">${t('startAuto')}</button></div>`,
      'small',
    );
    body.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) =>
      c.addEventListener('click', () => {
        pick = Number(c.dataset.n);
        body.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      }),
    );
    $('#auto-go', body).addEventListener('click', () => {
      const stop = ($('#auto-stop', body) as HTMLInputElement).checked;
      this.closeModal();
      this.h.autoStart(pick, stop);
    });
  }

  openInfo() {
    const s = this.s;
    const order: SymbolCode[] = ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4', 'L5'];
    const pay = order
      .map((code) => {
        const row = PAYTABLE[S[code]];
        const cells = [5, 4, 3]
          .map((n) => {
            const x = row[n - 3] / 100;
            return `<div><b>${n}</b> ${X(x)}<small>${money(x * s.bet)}</small></div>`;
          })
          .join('');
        return `<div class="pay"><img src="${symbolImg(code)}" alt="${code}"><div class="pay-rows">${cells}</div></div>`;
      })
      .join('');
    const lines = PAYLINES.map(
      (l, i) =>
        `<div class="pl"><span>${i + 1}</span><div class="pl-grid">${Array.from({ length: 25 }, (_, k) => {
          const reel = k % 5;
          const row = Math.floor(k / 5);
          return `<i class="${l[reel] === row ? 'on' : ''}"></i>`;
        }).join('')}</div></div>`,
    ).join('');
    const modeNames: Record<string, Key> = { base: 'modeBase', ante: 'modeAnte', bonus: 'modeBonus', super: 'modeSuper' };
    const modes = MODES.map((m) => {
      const ms = (summary.modes as Record<string, { rtp: number; cost: number }>)[m.name];
      return `<tr><td>${t(modeNames[m.name] ?? 'modeBase')}</td><td>${X(m.cost)}</td><td>${pct(ms?.rtp ?? summary.targetRtp)}</td><td>${X(WINCAP_X)}</td></tr>`;
    }).join('');
    const feature = (img: SymbolCode, title: string, text: string) =>
      `<div class="feature"><img src="${symbolImg(img)}" alt=""><div><h3>${title}</h3><p>${text}</p></div></div>`;
    const body = this.openModal(
      `<h2>${t('info')}</h2>
      <section class="settings">
        <label class="check"><input type="checkbox" id="set-sfx" ${s.sound ? 'checked' : ''}> ${t('sound')}</label>
        <label class="check"><input type="checkbox" id="set-music"> ${t('music')}</label>
        ${s.jur.disabledTurbo ? '' : `<label class="check"><input type="checkbox" id="set-turbo" ${s.turbo ? 'checked' : ''}> ${t('turboSetting')}</label>`}
      </section>
      <section>
        <p class="hero">${t('maxWinLine', { x: X(WINCAP_X) })} · RTP ${pct(summary.targetRtp)} · ${t('volatility')}</p>
        ${feature('SW', t('stormWild'), t('rulesStorm'))}
        ${feature('WD', 'WILD', t('rulesWild'))}
        ${feature('SC', 'BONUS', `${t('rulesBonus')} ${t('rulesRetrigger')}`)}
        <div class="tiers">
          <div class="tier tier1"><b>3 × BONUS</b><h3>${t('tier1')}</h3><p>${t('tier1Desc')}</p></div>
          <div class="tier tier2"><b>4 × BONUS</b><h3>${t('tier2')}</h3><p>${t('tier2Desc')}</p></div>
          <div class="tier tier3"><b>5 × BONUS</b><h3>${t('tier3')}</h3><p>${t('tier3Desc')}</p></div>
        </div>
        <p>${t('rulesHunt')}</p>
        ${s.jur.disabledBuyFeature ? '' : `<p>${t('rulesBuy')}</p>`}
      </section>
      <section><h2>${t('paytable')}</h2><div class="paytable">${pay}</div></section>
      <section><h2>${t('paylines')}</h2><p>${t('rulesGeneral')}</p><div class="paylines">${lines}</div></section>
      <section><h2>${t('rulesModes')}</h2>
        <table class="modes"><thead><tr><th>${t('rulesMode')}</th><th>${t('rulesCost')}</th><th>RTP</th><th>${t('rulesMaxWin')}</th></tr></thead><tbody>${modes}</tbody></table>
        <p>${t('rulesRtp')}: ${pct(summary.targetRtp)}. ${t('rulesMax', { x: X(WINCAP_X) })}</p>
      </section>
      <section><h2>${t('rulesTitle')}</h2><p>${t('rulesControls')}</p><p class="muted">${t('rulesMalfunction')}</p><p class="muted">CLOUDBURST v${summary.version}</p></section>`,
      'wide info',
    );
    const music = $('#set-music', body) as HTMLInputElement;
    music.checked = this.musicOn();
    ($('#set-sfx', body) as HTMLInputElement).checked = this.sfxOn();
    $('#set-sfx', body).addEventListener('change', () => this.h.toggleSfx());
    music.addEventListener('change', () => this.h.toggleMusic());
    $('#set-turbo', body)?.addEventListener('change', () => this.h.toggleTurbo());
  }

  musicOn: () => boolean = () => true;
  sfxOn: () => boolean = () => true;
}
