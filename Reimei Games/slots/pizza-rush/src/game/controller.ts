// Déroulé d'un tour : lit les événements du livre (Stake) et les met en scène.
import { audio } from '../audio/audio';
import { bookToMoney, money } from '../core/format';
import type { Backend, Round } from '../net/backend';
import type { Hud } from '../ui/hud';
import { PIXI } from './rigs';
import { Stage, textStyle } from './stage';
import { EASE, animate, tween } from './tween';
import { REELS, ROWS, TIERS, decodeReel, modeByName, type BookEvent, type SpinEvent, type SymbolCode, type Tier, type WayWin } from '../../shared/game';

const TIER_NAME: Record<Tier, string> = { 1: 'LUNCH RUSH', 2: 'DINNER RUSH', 3: 'MIDNIGHT RUSH' };

export class Game {
  private bets: number[] = [1_000_000];
  private betIdx = 0;
  private balance = 0;
  private currency = 'EUR';
  private ante = false;
  private turbo = false;
  private autoLeft = 0;
  private busy = false;
  private skipReq = false;
  private lossStreak = 0;

  constructor(
    private backend: Backend,
    private hud: Hud,
    private stage: Stage,
  ) {
    stage.reels.setBoard(stage.reels.randomBoard());
    stage.onTap = () => this.skip();
  }

  get bet() {
    return this.bets[this.betIdx];
  }

  async init(lang: string) {
    const a = await this.backend.authenticate(lang);
    this.balance = a.balance;
    this.currency = a.currency;
    this.bets = a.betLevels.length ? a.betLevels : [a.defaultBet];
    this.betIdx = Math.max(0, this.bets.indexOf(a.defaultBet));
    const j = a.jurisdiction;
    this.hud.setSocial(j.socialCasino);
    document.body.classList.toggle('no-turbo', j.disabledTurbo);
    document.body.classList.toggle('no-auto', j.disabledAutoplay);
    document.body.classList.toggle('no-buy', j.disabledBuyFeature);
    this.refresh();
    return a;
  }

  refresh() {
    this.hud.setBalance(this.balance);
    this.hud.setBet(this.bet);
  }

  // ------------------------------------------------------------ commandes
  changeBet(dir: -1 | 1) {
    if (this.busy) return;
    this.betIdx = Math.max(0, Math.min(this.bets.length - 1, this.betIdx + dir));
    audio.play('click');
    this.hud.setBet(this.bet);
  }
  setAnte(on: boolean) {
    this.ante = on;
    audio.play('click');
    this.hud.setAnte(on);
  }
  setTurbo(on: boolean) {
    this.turbo = on;
  }
  setAuto(n: number) {
    this.autoLeft = n;
    if (n && !this.busy) void this.spin();
  }

  skip() {
    if (this.busy) this.skipReq = true;
  }

  private wait(ms: number) {
    const real = this.turbo ? ms * 0.5 : ms;
    return new Promise<void>((resolve) => {
      if (this.skipReq) return resolve();
      const t0 = performance.now();
      const id = setInterval(() => {
        if (this.skipReq || performance.now() - t0 >= real) {
          clearInterval(id);
          resolve();
        }
      }, 16);
    });
  }

  async spin() {
    if (this.busy) {
      this.skip();
      return;
    }
    await this.start(this.ante ? 'ante' : 'base');
  }

  async buy(mode: string) {
    if (this.busy) return;
    await this.start(mode);
  }

  private async start(modeName: string) {
    const mode = modeByName(modeName);
    const cost = Math.round(this.bet * mode.cost);
    if (cost > this.balance) {
      this.autoLeft = 0;
      this.hud.setAuto(0);
      this.hud.toast('Insufficient balance');
      audio.play('oops');
      return;
    }
    this.busy = true;
    this.skipReq = false;
    this.hud.closeAll();
    this.hud.setBusy(true);
    this.hud.setWin(null);
    this.hud.setBalance(this.balance - cost);
    audio.play('click');
    audio.play('spin');
    this.stage.reels.startSpin();
    let round: Round;
    try {
      const t0 = performance.now();
      const res = await this.backend.play(this.bet, mode.name, this.currency);
      round = res.round;
      this.balance = res.balance;
      const min = this.turbo ? 150 : 420;
      const el = performance.now() - t0;
      if (el < min) await new Promise((r) => setTimeout(r, min - el));
    } catch (e: any) {
      console.error(e);
      this.hud.toast(e?.code === 'ERR_IPB' ? 'Insufficient balance' : e?.code === 'ERR_IS' ? 'Session expired, please reload' : 'Connection error, please retry');
      await this.landBoard(this.stage.reels.randomBoard());
      this.finish();
      return;
    }
    await this.playRound(round);
  }

  /** Reprise d'un tour resté ouvert (Stake). */
  async resume(round: Round) {
    this.busy = true;
    this.hud.setBusy(true);
    this.stage.reels.startSpin();
    await this.playRound(round);
  }

  // ------------------------------------------------------------ lecture du livre
  private async playRound(round: Round) {
    const betMicro = round.amount || this.bet;
    const toMicro = (units: number) => Math.round(bookToMoney(units, betMicro) * 1_000_000);
    let total = 0;
    let first = true;
    let fs = false;
    let tips = 0;
    let fsTotal = 0;
    const events = round.state as BookEvent[];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const next = events[i + 1];
      switch (ev.type) {
        case 'spin': {
          if (!first) {
            this.skipReq = false;
            audio.play('spin');
            this.stage.reels.startSpin();
            await this.wait(fs ? 380 : 300);
          }
          first = false;
          if (ev.fs) this.stage.setFreeSpins(ev.fs[0], fsTotal || ev.fs[1]);
          const triggers = next?.type === 'freeSpinTrigger' || next?.type === 'freeSpinRetrigger';
          await this.playSpin(ev, toMicro, triggers);
          if (fs && ev.tips !== undefined && ev.tips !== tips) {
            for (let k = tips; k < ev.tips; k++) {
              audio.play('tip');
              this.stage.setTips(k + 1);
              await this.wait(160);
            }
            tips = ev.tips;
          }
          total = ev.total;
          if (total > 0) this.hud.setWin(toMicro(total));
          break;
        }
        case 'freeSpinTrigger': {
          fs = true;
          tips = ev.tips;
          fsTotal = ev.spins;
          await this.enterFreeSpins(ev.tier, ev.spins, ev.tips);
          break;
        }
        case 'jarFull':
          fsTotal = ev.total;
          audio.play('jar');
          this.stage.setFreeSpins(0, ev.total);
          await this.banner(['TIP JAR FULL!', `+${ev.added} FREE SPINS`], 1800);
          break;
        case 'freeSpinRetrigger':
          fsTotal = ev.total;
          audio.play('trigger');
          this.stage.tony.play('bonus', { then: 'idle' });
          await this.banner(['MORE ORDERS!', `+${ev.added} FREE SPINS`], 1800);
          break;
        case 'freeSpinEnd':
          await this.exitFreeSpins(toMicro(ev.amount));
          fs = false;
          break;
        case 'wincap':
          await this.banner(['MAX WIN!', money(toMicro(ev.amount) / 1_000_000)], 2600);
          break;
        case 'finalWin':
          total = ev.amount;
          break;
      }
    }
    const x = total / 100;
    if (total > 0) {
      this.lossStreak = 0;
      if (x >= 15) await this.bigWin(toMicro(total), x);
      this.hud.setWin(toMicro(total));
    } else if (round.mode !== 'bonus' && round.mode !== 'super') {
      this.lossStreak++;
      if (this.lossStreak % 6 === 0) {
        this.stage.tony.play('perte', { then: 'idle' });
        audio.play('sad');
      }
    }
    try {
      if (round.active || total > 0) this.balance = await this.backend.endRound();
    } catch (e) {
      console.error(e);
      this.hud.toast('Connection error: your win is safe, please reload');
    }
    this.finish();
  }

  private finish() {
    this.busy = false;
    this.skipReq = false;
    this.hud.setBusy(false);
    this.hud.setBalance(this.balance);
    if (this.autoLeft > 0) {
      this.autoLeft--; // le tour qui vient de finir est décompté ; on relance tant qu'il en reste
      this.hud.setAuto(this.autoLeft);
      if (this.autoLeft > 0) setTimeout(() => !this.busy && void this.spin(), this.turbo ? 150 : 350);
    }
  }

  private async landBoard(board: SymbolCode[][]) {
    for (let r = 0; r < REELS; r++) {
      audio.play('stop', { i: r });
      await this.stage.reels.stopReel(r, board[r], true);
    }
  }

  private async playSpin(ev: SpinEvent, toMicro: (u: number) => number, triggers: boolean) {
    const reels = this.stage.reels;
    const board = ev.board.map(decodeReel);
    let sc = 0;
    const gap = this.turbo ? 70 : 140;
    for (let r = 0; r < REELS; r++) {
      const antic = sc >= 2 && !this.skipReq;
      if (antic) {
        reels.setAnticipation(r, true);
        audio.startLoop('suspense');
        this.stage.tony.play('suspense', { then: 'idle' });
        await this.wait(1100);
      } else if (r > 0) await this.wait(gap);
      const fast = this.skipReq || this.turbo;
      audio.play('stop', { i: r });
      await reels.stopReel(r, board[r], fast);
      reels.setAnticipation(r, false);
      const here = board[r].filter((c) => c === 'SC').length;
      if (here) {
        for (let k = 0; k < here; k++) audio.play('scatter', { i: sc + k });
        sc += here;
        if (sc >= 2 && r < REELS - 1) for (const [x, y] of reels.cellsOf('SC')) reels.playLoop(x, y, 'suspense');
      }
      if (board[r].includes('WD')) audio.play('wild');
    }
    audio.stopLoop('suspense');
    // les scatters reviennent au repos s'il n'y a pas de déclenchement
    if (!triggers) for (const [x, y] of reels.cellsOf('SC')) reels.play(x, y, 'land');

    // Rush Hour : Tony passe et pose des parts dorées
    if (ev.rush?.length) {
      this.stage.tony.play('rush', { then: 'idle' });
      audio.play('rush');
      await this.banner(['RUSH HOUR!'], 900, true);
      for (const [r, y] of ev.rush) {
        void reels.dropInto(r, y, 'WD');
        audio.play('wild');
        await this.wait(140);
      }
      await this.wait(320);
    }

    if (ev.wins?.length) await this.showWins(ev, board, toMicro);
    else if (ev.gameType === 'base' && sc === 2 && !triggers) {
      this.stage.tony.play('presque', { then: 'idle' });
      audio.play('oops');
    }
    if (triggers) {
      for (const [x, y] of reels.cellsOf('SC')) reels.play(x, y, 'declenche', 'danse');
      audio.play('trigger');
      this.stage.tony.play('bonus', { then: 'idle' });
      await this.wait(1500);
    }
  }

  private async showWins(ev: SpinEvent, board: SymbolCode[][], toMicro: (u: number) => number) {
    const reels = this.stage.reels;
    const cells: [number, number][] = [];
    const seen = new Set<number>();
    const b = board.map((c) => [...c]);
    for (const [r, y] of ev.rush ?? []) b[r][y] = 'WD';
    for (const w of ev.wins as WayWin[]) {
      const [sym, count] = w;
      for (let r = 0; r < count; r++)
        for (let y = 0; y < ROWS; y++)
          if (b[r][y] === sym || b[r][y] === 'WD') {
            const k = r * 10 + y;
            if (!seen.has(k)) {
              seen.add(k);
              cells.push([r, y]);
            }
          }
    }
    reels.highlight(cells);
    const x = ev.win / 100;
    audio.play(x >= 5 ? 'winBig' : 'win');
    if (x >= 3 && ev.gameType === 'base') this.stage.tony.play('gain', { then: 'idle' });
    const label = ev.mult && ev.mult > 1 ? `${money(toMicro(ev.win) / 1_000_000)}  (x${ev.mult})` : money(toMicro(ev.win) / 1_000_000);
    void this.popup(label, x);
    await this.wait(x >= 5 ? 1700 : 1250);
    reels.clearHighlight();
  }

  // ------------------------------------------------------------ mise en scène
  private async popup(text: string, x: number) {
    const st = this.stage;
    const t = new PIXI.Text({ text, style: textStyle(x >= 5 ? 92 : 72, ['#ffffff', '#ffe27a', '#ffae2a'], 12) });
    t.anchor.set(0.5);
    const c = st.boardCenter;
    t.position.set(c.x, c.y);
    t.scale.set(0.3);
    st.fx.addChild(t);
    await tween(t.scale, { x: 1, y: 1 }, 320, EASE.outBack);
    await animate(this.turbo ? 500 : 900, () => {});
    await tween(t, { alpha: 0, y: c.y - 40 }, 260, EASE.inQuad);
    t.destroy();
  }

  /** Bannière plein écran (titre + sous-titre), passe au tap. */
  private async banner(lines: string[], ms: number, light = false) {
    const st = this.stage;
    const g = new PIXI.Container();
    const dim = new PIXI.Graphics().rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: light ? 0.25 : 0.55 });
    g.addChild(dim);
    const c = st.boardCenter;
    lines.forEach((l, i) => {
      const t = new PIXI.Text({ text: l, style: textStyle(i === 0 ? 120 : 70, i === 0 ? ['#fff6c2', '#ffc83a', '#ff7a1a'] : '#ffffff', 14) });
      t.anchor.set(0.5);
      t.position.set(c.x, c.y + (i === 0 ? -40 * (lines.length - 1) : 50 + (i - 1) * 80));
      g.addChild(t);
    });
    g.alpha = 0;
    st.fx.addChild(g);
    audio.play('banner');
    const texts = g.children.slice(1);
    texts.forEach((t: any) => t.scale.set(0.3));
    void tween(g, { alpha: 1 }, 200);
    for (let i = 0; i < texts.length; i++) {
      void tween(texts[i].scale, { x: 1, y: 1 }, 420, EASE.outBack);
      await animate(60, () => {});
    }
    this.skipReq = false;
    await this.wait(ms);
    await tween(g, { alpha: 0 }, 220);
    g.destroy({ children: true });
    this.skipReq = false;
  }

  private async enterFreeSpins(tier: Tier, spins: number, tips: number) {
    this.hud.setBusy(true, true);
    audio.setMusic('fs');
    void this.stage.setNight(true);
    this.stage.setTips(tips, false);
    this.stage.setFreeSpins(0, spins);
    this.stage.showFreeSpinsPanel(true);
    const info = TIERS[tier];
    const sub = info.startTips ? `${spins} FREE SPINS · STARTS AT x${[1, 2, 3, 4, 6, 8, 12, 20, 40, 100][tips]}` : `${spins} FREE SPINS`;
    await this.banner([TIER_NAME[tier], sub], 2400);
  }

  private async exitFreeSpins(winMicro: number) {
    await this.banner(['TOTAL WIN', money(winMicro / 1_000_000)], 2400);
    this.stage.showFreeSpinsPanel(false);
    void this.stage.setNight(false);
    audio.setMusic('base');
    this.hud.setBusy(true, false);
  }

  /** Grosse victoire : compteur qui monte, niveaux BIG / MEGA / PIZZA PARTY. */
  private async bigWin(winMicro: number, x: number) {
    const st = this.stage;
    const levels = [
      { at: 15, name: 'BIG WIN' },
      { at: 40, name: 'MEGA WIN' },
      { at: 100, name: 'PIZZA PARTY!' },
    ].filter((l) => x >= l.at);
    for (const c of st.fx.children) c.visible = false; // l'affichage du gain précédent s'efface
    const g = new PIXI.Container();
    g.addChild(new PIXI.Graphics().rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: 0.6 }));
    const c = st.boardCenter;
    const title = new PIXI.Text({ text: levels[0].name, style: textStyle(130, ['#fff6c2', '#ffc83a', '#ff7a1a'], 16) });
    title.anchor.set(0.5);
    title.position.set(c.x, c.y - 70);
    const amount = new PIXI.Text({ text: money(0), style: textStyle(96, '#ffffff', 14) });
    amount.anchor.set(0.5);
    amount.position.set(c.x, c.y + 70);
    g.addChild(title, amount);
    st.fx.addChild(g);
    st.tony.play('grosgain', { then: 'idle' });
    audio.play('winBig');
    title.scale.set(0.2);
    void tween(title.scale, { x: 1, y: 1 }, 500, EASE.outBackBig);
    this.skipReq = false;
    const dur = Math.min(6000, 2200 + levels.length * 1200);
    let lvl = 0;
    audio.countStart();
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        const k = this.skipReq ? 1 : Math.min(1, (performance.now() - t0) / dur);
        const v = winMicro * EASE.outQuad(k);
        amount.text = money(v / 1_000_000);
        const nx = levels.findLastIndex((l) => (v / winMicro) * x >= l.at);
        if (nx > lvl) {
          lvl = nx;
          title.text = levels[lvl].name;
          title.scale.set(0.4);
          void tween(title.scale, { x: 1.05, y: 1.05 }, 420, EASE.outBackBig);
          audio.play('winBig');
          st.tony.play('grosgain', { then: 'idle' });
        }
        if (k >= 1) {
          clearInterval(id);
          audio.countStop();
          resolve();
        }
      }, 33);
    });
    this.skipReq = false;
    await this.wait(1600);
    await tween(g, { alpha: 0 }, 300);
    g.destroy({ children: true });
    this.skipReq = false;
  }
}
