// Game flow: bets, RGS round lifecycle, and the book event player that turns
// Stake Engine events into animations, sounds and UI updates.

import {
  MODES,
  TIERS,
  WINCAP,
  WINCAP_X,
  decodeReel,
  modeByName,
  type BookEvent,
  type SpinEvent,
  type SymbolCode,
  type Tier,
  type LineWin,
} from '../../shared/game';
import { audio } from '../audio/audio';
import { bookToMoney, fromMicro, money } from '../core/format';
import { t, type Key } from '../core/i18n';
import { clock } from '../render/anim';
import type { Renderer } from '../render/renderer';
import { RgsError, type Backend, type Jurisdiction, type Round, DEFAULT_JURISDICTION } from '../net/backend';
import type { UI, UiState } from '../ui/ui';

const BIG_WIN_TIERS: [number, Key][] = [
  [15, 'bigWin'],
  [50, 'megaWin'],
  [150, 'epicWin'],
  [500, 'legendaryWin'],
];

interface PlayCtx {
  bet: number; // base bet, micro
  round: Round;
  fast: boolean; // resume / replay acceleration
  tier: Tier | 0;
  hadBonus: boolean;
  sticky: boolean;
  lastWins: LineWin[];
  prevTotal: number;
  baseBoard: SymbolCode[][] | null;
}

export class Game {
  private s: UiState;
  private levels: number[] = [];
  private balance = 0; // micro
  private autoStopOnFeature = true;
  private idleToken = 0;
  private lastBoard: SymbolCode[][];
  private reelsSpinning = false;
  private replayRound: Round | null = null;
  private currency = 'USD';

  constructor(
    private backend: Backend,
    private ui: UI,
    private r: Renderer,
  ) {
    this.s = {
      balance: 0,
      bet: 1,
      betIndex: 0,
      betCount: 1,
      ante: false,
      busy: true,
      spinning: false,
      autoLeft: 0,
      turbo: false,
      win: 0,
      winLabel: 'win',
      fs: null,
      replay: backend.kind === 'replay',
      demo: backend.kind === 'demo',
      net: 0,
      sessionStart: Date.now(),
      jur: { ...DEFAULT_JURISDICTION },
      sound: audio.sfxOn || audio.musicOn,
    };
    this.lastBoard = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, y) => r.board.symbolAt(i, y)));
    ui.musicOn = () => audio.musicOn;
    ui.sfxOn = () => audio.sfxOn;
    ui.bind({
      spin: () => this.onSpinButton(),
      betUp: () => this.changeBet(1),
      betDown: () => this.changeBet(-1),
      toggleAnte: () => {
        audio.click();
        this.s.ante = !this.s.ante;
        this.render();
      },
      buy: (mode) => this.spin(mode),
      autoStart: (n, stop) => {
        this.autoStopOnFeature = stop;
        this.s.autoLeft = n;
        this.render();
        this.spin();
      },
      autoStop: () => {
        this.s.autoLeft = 0;
        this.render();
      },
      toggleTurbo: () => {
        if (this.s.jur.disabledTurbo) return;
        this.s.turbo = !this.s.turbo;
        clock.speed = this.s.turbo ? 1.8 : 1;
        audio.click();
        this.render();
      },
      toggleSound: () => {
        const on = !(audio.sfxOn || audio.musicOn);
        audio.setSfx(on);
        audio.setMusicOn(on);
        this.s.sound = on;
        this.render();
      },
      toggleSfx: () => {
        audio.setSfx(!audio.sfxOn);
        this.s.sound = audio.sfxOn || audio.musicOn;
        this.render();
      },
      toggleMusic: () => {
        audio.setMusicOn(!audio.musicOn);
        this.s.sound = audio.sfxOn || audio.musicOn;
        this.render();
      },
      skip: () => this.skip(),
      replayAgain: () => this.playReplay(),
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || this.s.jur.disabledSpacebar || this.ui.modalOpen) return;
      e.preventDefault();
      if (this.s.busy && !this.reelsSpinning) this.skip();
      else this.onSpinButton();
    });
    r.bg.onThunder = (s) => audio.rumble(s);
  }

  private render() {
    this.s.balance = fromMicro(this.balance);
    this.s.bet = fromMicro(this.levels[this.s.betIndex] ?? 0);
    this.s.betCount = this.levels.length;
    this.s.spinning = this.reelsSpinning;
    this.ui.render(this.s);
  }

  get jurisdiction(): Jurisdiction {
    return this.s.jur;
  }

  // ------------------------------------------------------------ setup

  async init(lang: string) {
    const auth = await this.backend.authenticate(lang);
    this.balance = auth.balance;
    this.currency = auth.currency;
    this.s.jur = auth.jurisdiction;
    let levels = auth.betLevels.filter((v) => v >= auth.minBet && v <= auth.maxBet);
    if (!levels.length) {
      levels = [];
      for (let v = auth.minBet; v <= auth.maxBet && levels.length < 60; v += Math.max(auth.stepBet, auth.minBet)) levels.push(v);
    }
    this.levels = levels;
    const def = levels.indexOf(auth.defaultBet);
    this.s.betIndex = def >= 0 ? def : 0;
    if (auth.round && auth.round.amount > 0) {
      const i = levels.indexOf(auth.round.amount);
      if (i >= 0) this.s.betIndex = i;
    }
    this.s.busy = false;
    this.render();
    return auth;
  }

  /** Continue a round that was interrupted (RGS `round.active`). */
  async resume(round: Round) {
    this.ui.toast(t('resume'), 2500);
    if (modeByName(round.mode).kind === 'ante') this.s.ante = true;
    this.s.busy = true;
    this.render();
    const bonus = round.state.some((e) => e.type === 'freeSpinTrigger');
    await this.playRound(round, { fast: true, earlyEnd: false });
    if (round.active) await this.finishWallet(bonus);
    this.s.busy = false;
    this.render();
  }

  setReplay(round: Round) {
    this.replayRound = round;
    this.levels = [round.amount];
    this.s.betIndex = 0;
    this.s.busy = false;
    this.render();
  }

  async playReplay() {
    if (!this.replayRound) return;
    this.ui.hideBanner();
    this.s.busy = true;
    this.s.win = 0;
    this.render();
    await this.playRound(this.replayRound, { fast: false, earlyEnd: false });
    this.s.busy = false;
    this.render();
    await this.ui.banner('replay-end', `<div class="title small">${t('replayDone')}</div><button class="cta">${t('replayAgain')}</button>`);
    void this.playReplay();
  }

  // ------------------------------------------------------------ input

  private changeBet(d: number) {
    if (this.s.busy || this.s.autoLeft > 0) return;
    this.s.betIndex = Math.max(0, Math.min(this.levels.length - 1, this.s.betIndex + d));
    audio.click();
    this.render();
  }

  private onSpinButton() {
    if (this.s.replay) return;
    if (this.s.autoLeft > 0) {
      this.s.autoLeft = 0;
      this.render();
      return;
    }
    if (this.reelsSpinning) {
      if (!this.s.jur.disabledSlamstop) this.r.board.slam();
      return;
    }
    if (this.s.busy) {
      this.skip();
      return;
    }
    void this.spin();
  }

  skip() {
    if (this.s.busy && !this.reelsSpinning) clock.skip();
  }

  get state(): Readonly<UiState> {
    return this.s;
  }

  refresh() {
    this.render();
  }

  // ------------------------------------------------------------ round

  async spin(buyMode?: string) {
    if (this.s.busy || this.s.replay) return;
    audio.unlock();
    const mode = buyMode ?? (this.s.ante ? 'ante' : 'base');
    const info = modeByName(mode);
    const bet = this.levels[this.s.betIndex];
    const cost = Math.round(bet * info.cost);
    if (cost > this.balance) {
      this.s.autoLeft = 0;
      this.render();
      audio.error();
      this.ui.error(t('insufficient'));
      return;
    }
    this.idleToken++;
    clock.endSkip();
    this.s.busy = true;
    this.s.win = 0;
    this.s.winLabel = 'win';
    this.r.board.clearWins();
    this.r.board.startSpin(this.s.turbo);
    this.reelsSpinning = true;
    audio.spinStart();
    this.render();
    if (info.kind === 'buy') audio.coins();
    const started = performance.now();

    let round: Round;
    try {
      const res = await this.backend.play(bet, info.name, this.currency);
      this.balance = res.balance;
      round = res.round;
    } catch (err) {
      await this.r.board.stopReels(this.lastBoard, [0, 60, 120, 180, 240], [false, false, false, false, false], (i) => audio.reelStop(i));
      this.reelsSpinning = false;
      this.s.busy = false;
      this.s.autoLeft = 0;
      this.render();
      this.handleError(err);
      return;
    }
    this.s.net -= fromMicro(cost);
    this.render();

    const hasBonus = round.state.some((e) => e.type === 'freeSpinTrigger');
    const payout = await this.playRound(round, { fast: false, earlyEnd: !hasBonus });
    if (round.active) await this.finishWallet(hasBonus);
    this.s.net += bookToMoney(payout, bet);

    // jurisdiction minimum round duration (seconds, or ms when large)
    const min = this.s.jur.minimumRoundDuration || 0;
    const minMs = min > 100 ? min : min * 1000;
    const elapsed = performance.now() - started;
    if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));

    this.s.busy = false;
    this.render();
    this.afterRound(hasBonus);
  }

  private endPromise: Promise<number> | null = null;

  private async finishWallet(_bonus: boolean) {
    try {
      const bal = await (this.endPromise ?? this.backend.endRound());
      this.balance = bal;
    } catch (err) {
      this.handleError(err);
    }
    this.endPromise = null;
    this.render();
  }

  private afterRound(hadBonus: boolean) {
    if (this.s.autoLeft > 0) {
      if (Number.isFinite(this.s.autoLeft)) this.s.autoLeft--;
      const bet = this.levels[this.s.betIndex] * (this.s.ante ? 3 : 1);
      if ((hadBonus && this.autoStopOnFeature) || bet > this.balance) this.s.autoLeft = 0;
      this.render();
      if (this.s.autoLeft > 0) {
        window.setTimeout(() => void this.spin(), this.s.turbo ? 250 : 550);
        return;
      }
    }
    void this.idleCycle();
  }

  private lastSpinWins: LineWin[] = [];

  /** While idle, show each winning line of the last spin in turn. */
  private async idleCycle() {
    const token = ++this.idleToken;
    const wins = this.lastSpinWins;
    if (wins.length < 2) return;
    const bet = this.levels[this.s.betIndex];
    await clock.wait(1200);
    for (let k = 0; token === this.idleToken; k = (k + 1) % wins.length) {
      const w = wins[k];
      this.r.board.showWins([w], money(bookToMoney(w[4], bet)));
      await clock.wait(1300);
    }
  }

  private handleError(err: unknown) {
    audio.error();
    const code = err instanceof RgsError ? err.code : (err as { code?: string })?.code ?? '';
    if (code === 'ERR_IPB') return this.ui.error(t('insufficient'));
    if (code === 'ERR_IS' || code === 'ERR_ATE') return this.ui.error(t('errorSession'), true);
    if (code === 'ERR_GLE') return this.ui.error(t('errorLimits'));
    if (code === 'ERR_LOC') return this.ui.error(t('errorLocation'));
    this.ui.error(`${t('errorGeneric')}${code ? ` (${code})` : ''}`);
  }

  // ------------------------------------------------------------ book player

  /** Play every event of a round. Returns the final payout (book units). */
  private async playRound(round: Round, opts: { fast: boolean; earlyEnd: boolean }): Promise<number> {
    const bet = round.amount;
    if (opts.earlyEnd && round.active && this.backend.kind === 'rgs') {
      // single-spin win: settle immediately, update the balance after the presentation
      this.endPromise = this.backend.endRound();
      this.endPromise.catch(() => undefined);
    }
    const ctx: PlayCtx = { bet, round, fast: opts.fast, tier: 0, hadBonus: false, sticky: false, lastWins: [], prevTotal: 0, baseBoard: null };
    if (opts.fast) clock.speed = 3;
    let final = 0;
    this.lastSpinWins = [];
    for (const e of round.state) {
      final = await this.playEvent(e, ctx);
      if (ctx.tier && this.backend.kind === 'rgs' && e.type === 'spin' && e.gameType === 'free') void this.backend.saveEvent(e.index);
    }
    if (opts.fast) clock.speed = this.s.turbo ? 1.8 : 1;
    this.lastSpinWins = ctx.lastWins;
    return final;
  }

  private async playEvent(e: BookEvent, ctx: PlayCtx): Promise<number> {
    switch (e.type) {
      case 'spin':
        await this.playSpin(e, ctx);
        return e.total;
      case 'freeSpinTrigger':
        await this.fsIntro(e.tier, e.spins, ctx);
        return 0;
      case 'startingWild':
        audio.storm(e.mult);
        await this.r.board.expandStorm(e.reel, -1, e.mult, true);
        this.r.board.lockReel(e.reel, true);
        await clock.wait(300);
        return 0;
      case 'freeSpinRetrigger':
        audio.retrigger();
        this.r.board.glowScatters(true);
        if (this.s.fs) this.s.fs.total = e.total;
        this.render();
        await this.ui.banner('retrigger', `<div class="title">${t('plusSpins', { n: e.added })}</div>`, ctx.fast ? 600 : 1500);
        this.ui.hideBanner();
        this.r.board.glowScatters(false);
        return 0;
      case 'freeSpinEnd':
        await this.fsOutro(e.amount, ctx);
        return e.amount;
      case 'wincap':
        await this.presentWin(e.amount, ctx.bet, 'maxWinReached', true, ctx.fast);
        return e.amount;
      case 'finalWin':
        this.s.win = bookToMoney(e.amount, ctx.bet);
        this.s.winLabel = 'win';
        this.render();
        if (!ctx.hadBonus && e.amount >= 1500 && e.amount < WINCAP) await this.presentWin(e.amount, ctx.bet, 'bigWin', false, ctx.fast);
        return e.amount;
    }
  }

  private async playSpin(e: SpinEvent, ctx: PlayCtx) {
    const board = e.board.map(decodeReel) as SymbolCode[][];
    const b = this.r.board;
    const turbo = this.s.turbo || ctx.fast;
    if (!this.reelsSpinning) {
      b.startSpin(turbo);
      this.reelsSpinning = true;
      audio.spinStart();
      this.render();
      await clock.wait(turbo ? 160 : 380);
    }
    if (e.gameType === 'free' && this.s.fs && e.fs) {
      this.s.fs.current = e.fs[0];
      this.s.fs.total = e.fs[1];
      this.render();
    }
    // anticipation: 2+ scatters already visible on earlier reels
    const anticipate = [false, false, false, false, false];
    let sc = 0;
    for (let i = 0; i < 5; i++) {
      anticipate[i] = sc >= 2 && !b.reels[i].locked;
      if (board[i].includes('SC')) sc++;
    }
    const stagger = turbo ? 70 : 150;
    const delays: number[] = [];
    let extra = 0;
    for (let i = 0; i < 5; i++) {
      if (anticipate[i]) extra += turbo ? 450 : 900;
      delays.push(i * stagger + extra);
    }
    let landed = 0;
    await b.stopReels(board, delays, anticipate, (i) => {
      audio.reelStop(i);
      if (board[i].includes('SC')) {
        landed++;
        audio.scatter(landed);
        b.scatterLanded(i);
      }
      if (anticipate[i + 1]) audio.anticipationStart();
      else audio.anticipationStop();
    });
    audio.anticipationStop();
    this.reelsSpinning = false;
    this.lastBoard = board;
    this.render();

    // Storm Wilds
    for (const [reel, row, mult] of e.storm ?? []) {
      if (row >= 0) {
        audio.storm(mult);
        await b.expandStorm(reel, row, mult, ctx.sticky);
        if (ctx.sticky) b.lockReel(reel, true);
      } else if (!b.storms.has(reel)) b.setStorm(reel, mult, true);
    }

    // wins
    ctx.lastWins = e.wins ?? [];
    if (e.win > 0 && e.wins) {
      const x = e.win / 100;
      b.showWins(e.wins);
      audio.win(x >= 10 ? 3 : x >= 3 ? 2 : x >= 1 ? 1 : 0);
      if (x >= 5) b.shake(0.3);
      const from = bookToMoney(ctx.prevTotal, ctx.bet);
      const to = bookToMoney(e.total, ctx.bet);
      await this.countUp(from, to, Math.min(1600, 350 + x * 60), (v) => {
        this.s.win = v;
        if (this.s.fs) this.s.fs.win = v;
        this.render();
      });
      await clock.wait(turbo ? 300 : e.gameType === 'free' ? 650 : 500);
    } else if (e.gameType === 'free') {
      await clock.wait(turbo ? 120 : 260);
    }
    ctx.prevTotal = e.total;
    if (e.gameType === 'base') ctx.baseBoard = board;
  }

  private countUp(from: number, to: number, ms: number, set: (v: number) => void) {
    let lastTick = 0;
    return clock.tween(
      ms,
      (k) => {
        set(from + (to - from) * k);
        if (clock.now - lastTick > 70 && k < 1) {
          lastTick = clock.now;
          audio.tick();
        }
      },
      (k) => 1 - Math.pow(1 - k, 2),
    );
  }

  private async fsIntro(tier: Tier, spins: number, ctx: PlayCtx) {
    const b = this.r.board;
    b.glowScatters(true);
    audio.fsTrigger();
    b.shake(0.5);
    await clock.wait(1500);
    clock.endSkip();
    const auto = this.s.autoLeft > 0 || ctx.fast || this.s.replay;
    await this.ui.banner(
      `fs-intro tier${tier}`,
      `<div class="kicker">${t('scattersTrigger', { n: TIERS[tier].scatters })}</div>
       <div class="title">${t(`tier${tier}` as Key)}</div>
       <div class="sub">${t('freeSpinsCount', { n: spins })}</div>
       <p>${t(`tier${tier}Desc` as Key)}</p>
       <div class="tap">${t('continue')}</div>`,
      auto ? 2600 : undefined,
    );
    this.ui.hideBanner();
    audio.click();
    // enter free spins
    ctx.tier = tier;
    ctx.hadBonus = true;
    ctx.sticky = TIERS[tier].sticky;
    b.glowScatters(false);
    b.clearWins();
    b.clearStorms();
    b.useFreeSpinReels(tier);
    this.r.bg.fsTarget = 1;
    this.r.showLogo = false;
    audio.setMusic('fs');
    this.s.fs = { tier, current: 0, total: spins, win: bookToMoney(ctx.prevTotal, ctx.bet) };
    this.s.winLabel = 'totalWin';
    this.render();
    await clock.wait(400);
  }

  private async fsOutro(amount: number, ctx: PlayCtx) {
    await clock.wait(500);
    clock.endSkip();
    const b = this.r.board;
    if (amount < WINCAP) await this.presentWin(amount, ctx.bet, 'totalWin', false, ctx.fast, true);
    b.clearWins();
    b.clearStorms();
    b.useFreeSpinReels(0);
    if (ctx.baseBoard) b.setBoard(ctx.baseBoard);
    this.r.bg.fsTarget = 0;
    this.r.showLogo = true;
    audio.setMusic('base');
    this.s.fs = null;
    ctx.tier = 0;
    ctx.sticky = false;
    ctx.lastWins = [];
    this.render();
  }

  /**
   * Celebration with count-up. Big win tiers upgrade live (BIG → MEGA → EPIC →
   * LEGENDARY). Tap once to jump to the final amount, tap again to close.
   */
  private async presentWin(amount: number, bet: number, titleKey: Key, max: boolean, fast: boolean, always = false) {
    const x = amount / 100;
    const firstTier = BIG_WIN_TIERS.findIndex(([m]) => x < m) - 1;
    const tierIdx = firstTier === -2 ? BIG_WIN_TIERS.length - 1 : firstTier;
    if (!always && !max && tierIdx < 0) return;
    const total = bookToMoney(amount, bet);
    const big = max || tierIdx >= 0;
    const title = max ? t('maxWinReached') : always && tierIdx < 0 ? t(titleKey) : t(BIG_WIN_TIERS[0][1]);
    const dur = fast ? 900 : max ? 6500 : big ? 2400 + Math.max(0, tierIdx) * 1300 : 1400;
    let skipped = false;
    const closed = this.ui.banner(
      `win ${max ? 'max' : big ? 'big' : 'plain'}`,
      `<div class="title pop">${title}</div><div class="count">${money(0)}</div><div class="xbet">${max ? `${WINCAP_X.toLocaleString('en-US')}x` : ''}</div><div class="tap">${t('continue')}</div>`,
    );
    void closed.then(() => (skipped = true));
    if (big) {
      audio.bigWin(max ? 4 : 0);
      this.r.board.coinShower(max ? 140 : 40 + Math.max(0, tierIdx) * 30, this.r.layout.w);
    } else audio.win(2);
    if (max) this.r.bg.strike(1);
    let shown = 0;
    const el = () => this.ui.bannerCount();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const k = skipped ? 1 : Math.min(1, (performance.now() - start) / dur);
        const v = total * (1 - Math.pow(1 - k, 2.2));
        const node = el();
        if (node) node.textContent = money(v);
        if (!max && big) {
          const curX = (v / total) * x;
          let ti = -1;
          for (let i = 0; i < BIG_WIN_TIERS.length; i++) if (curX >= BIG_WIN_TIERS[i][0]) ti = i;
          if (ti > shown && ti >= 0) {
            shown = ti;
            this.ui.setBannerTitle(t(BIG_WIN_TIERS[ti][1]));
            audio.bigWin(ti);
            this.r.board.coinShower(30, this.r.layout.w);
          }
        }
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    this.s.win = total;
    this.render();
    if (!skipped) {
      const auto = fast || this.s.autoLeft > 0 || this.s.replay;
      await Promise.race([closed, new Promise((r) => setTimeout(r, auto ? 1200 : 4000))]);
    } else await new Promise((r) => setTimeout(r, 700));
    this.ui.hideBanner();
  }
}

// keep tree-shaking friendly reference to MODES for type completeness
export const BUY_MODES = MODES.filter((m) => m.kind === 'buy').map((m) => m.name);
