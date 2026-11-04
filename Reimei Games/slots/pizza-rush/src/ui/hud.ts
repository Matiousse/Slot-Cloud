// Interface (DOM, nette à toutes les tailles) : barre de commande, achat du bonus, règles, messages.
// Mode « social casino » de Stake : les mots interdits (bet, buy, pay…) sont remplacés.
import { money, fromMicro } from '../core/format';
import { MODES, PAYTABLE, S, TARGET_RTP, WINCAP_X, TIERS, TIP_MULT, RUSH_COUNTS } from '../../shared/game';

const WORDS = {
  normal: { bet: 'BET', buy: 'BUY BONUS', buyShort: 'BUY', pays: 'PAYS', paytable: 'PAYTABLE', cost: 'COST', ante: 'ANTE' },
  social: { bet: 'PLAY', buy: 'GET BONUS', buyShort: 'GET', pays: 'AWARDS', paytable: 'AWARD TABLE', cost: 'PRICE', ante: 'BOOST' },
};

export interface HudEvents {
  spin(): void;
  bet(dir: -1 | 1): void;
  ante(on: boolean): void;
  buy(mode: string): void;
  turbo(on: boolean): void;
  auto(n: number): void;
  sound(on: boolean): void;
}

const AUTO_STEPS = [0, 10, 25, 50, 100];

export class Hud {
  private w = WORDS.normal;
  private el: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private anteOn = false;
  private turboOn = false;
  private soundOn = true;
  private autoIdx = 0;
  private bet = 1_000_000;
  canBuy = true;

  constructor(
    el: HTMLElement,
    private ev: HudEvents,
  ) {
    this.el = el;
    this.render();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        if (!document.querySelector('.modal.open')) this.ev.spin();
      }
    });
  }

  setSocial(on: boolean) {
    this.w = on ? WORDS.social : WORDS.normal;
    this.render();
  }

  private render() {
    const w = this.w;
    this.el.innerHTML = `
      <div class="bar">
        <div class="grp left">
          <button class="ic" data-a="info" title="Rules">i</button>
          <button class="ic" data-a="sound" title="Sound">♪</button>
        </div>
        <div class="grp stats">
          <div class="stat"><span>BALANCE</span><b data-v="balance">–</b></div>
          <div class="stat win"><span>WIN</span><b data-v="win"></b></div>
          <div class="stat bet"><span>${w.bet}</span>
            <div class="betctl"><button data-a="minus">−</button><b data-v="bet">–</b><button data-a="plus">+</button></div>
          </div>
        </div>
        <div class="grp right">
          <button class="pill ante" data-a="ante" title="Ante"><i></i><span>${w.ante}<small>×5 BONUS CHANCE</small></span></button>
          <button class="pill buy" data-a="buy">${w.buy}</button>
          <button class="ic small" data-a="turbo" title="Turbo">⚡</button>
          <button class="ic small" data-a="auto" title="Auto"><span data-v="auto">AUTO</span></button>
          <button class="spin" data-a="spin" aria-label="Spin"><span>⟳</span></button>
        </div>
      </div>
      <div class="modal" data-m="buy"><div class="card">
        <h2>${w.buy}</h2>
        <div class="offers">
          ${MODES.filter((m) => m.kind === 'buy')
            .map((m) => {
              const t = TIERS[m.tier!];
              const mult = TIP_MULT[t.startTips];
              return `<button class="offer" data-buy="${m.name}">
                <h3>${t.key === 'lunchRush' ? 'LUNCH RUSH' : 'DINNER RUSH'}</h3>
                <p>${t.spins} FREE SPINS</p><p>${t.startTips ? `starts at <b>x${mult}</b>` : 'tip jar from <b>x1</b>'}</p>
                <div class="price">${w.cost} <b data-price="${m.cost}">${m.cost}x</b></div></button>`;
            })
            .join('')}
        </div>
        <button class="close" data-a="close">✕</button>
      </div></div>
      <div class="modal" data-m="confirm"><div class="card small">
        <h2 data-v="confirmTitle"></h2><p data-v="confirmText"></p>
        <div class="row"><button class="pill" data-a="close">CANCEL</button><button class="pill buy" data-a="confirm">CONFIRM</button></div>
      </div></div>
      <div class="modal" data-m="info"><div class="card rules">${this.rulesHtml()}<button class="close" data-a="close">✕</button></div></div>
      <div class="toast" data-v="toast"></div>`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', (e) => this.click(b.dataset.a!, e)));
    this.el.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => this.askBuy(b.dataset.buy!)));
    this.refreshToggles();
    this.setBet(this.bet);
  }

  private pendingBuy = '';
  private askBuy(mode: string) {
    const m = MODES.find((x) => x.name === mode)!;
    this.pendingBuy = mode;
    this.q('[data-v="confirmTitle"]').textContent = `${this.w.buyShort} ${TIERS[m.tier!].key === 'lunchRush' ? 'LUNCH RUSH' : 'DINNER RUSH'}?`;
    this.q('[data-v="confirmText"]').textContent = `${this.w.cost}: ${money(fromMicro(this.bet * m.cost))}`;
    this.open('confirm');
  }

  private click(a: string, e: Event) {
    e.stopPropagation();
    switch (a) {
      case 'spin':
        return this.ev.spin();
      case 'minus':
        return this.ev.bet(-1);
      case 'plus':
        return this.ev.bet(1);
      case 'ante':
        this.anteOn = !this.anteOn;
        this.refreshToggles();
        return this.ev.ante(this.anteOn);
      case 'buy':
        if (!this.canBuy) return;
        this.el.querySelectorAll<HTMLElement>('[data-price]').forEach((p) => (p.textContent = money(fromMicro(this.bet * Number(p.dataset.price)))));
        return this.open('buy');
      case 'turbo':
        this.turboOn = !this.turboOn;
        this.refreshToggles();
        return this.ev.turbo(this.turboOn);
      case 'auto':
        this.autoIdx = (this.autoIdx + 1) % AUTO_STEPS.length;
        this.setAuto(AUTO_STEPS[this.autoIdx]);
        return this.ev.auto(AUTO_STEPS[this.autoIdx]);
      case 'sound':
        this.soundOn = !this.soundOn;
        this.refreshToggles();
        return this.ev.sound(this.soundOn);
      case 'info':
        return this.open('info');
      case 'close':
        return this.closeAll();
      case 'confirm':
        this.closeAll();
        return this.ev.buy(this.pendingBuy);
    }
  }

  private open(m: string) {
    this.closeAll();
    this.q(`[data-m="${m}"]`).classList.add('open');
  }
  closeAll() {
    this.el.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
  }

  private refreshToggles() {
    this.q('[data-a="ante"]').classList.toggle('on', this.anteOn);
    this.q('[data-a="turbo"]').classList.toggle('on', this.turboOn);
    this.q('[data-a="sound"]').classList.toggle('off', !this.soundOn);
    this.q('[data-a="buy"]').classList.toggle('disabled', this.anteOn || !this.canBuy);
  }

  setAuto(n: number) {
    this.autoIdx = Math.max(0, AUTO_STEPS.indexOf(n));
    const el = this.q('[data-v="auto"]');
    el.textContent = n ? String(n) : 'AUTO';
    this.q('[data-a="auto"]').classList.toggle('on', n > 0);
  }

  setBalance(micro: number) {
    this.q('[data-v="balance"]').textContent = money(fromMicro(micro));
  }
  setWin(micro: number | null) {
    this.q('[data-v="win"]').textContent = micro ? money(fromMicro(micro)) : '';
  }
  setBet(micro: number) {
    this.bet = micro;
    const shown = this.anteOn ? micro * 3 : micro;
    this.q('[data-v="bet"]').textContent = money(fromMicro(shown));
  }
  setAnte(on: boolean) {
    this.anteOn = on;
    this.refreshToggles();
    this.setBet(this.bet);
  }
  setBusy(busy: boolean, freeSpins = false) {
    this.el.classList.toggle('busy', busy);
    this.el.classList.toggle('fs', freeSpins);
    this.q('[data-a="spin"]').classList.toggle('spinning', busy);
  }
  setBuyAllowed(on: boolean) {
    this.canBuy = on;
    this.refreshToggles();
  }
  toast(msg: string, ms = 2600) {
    const t = this.q('[data-v="toast"]');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout((t as any)._h);
    (t as any)._h = setTimeout(() => t.classList.remove('show'), ms);
  }

  private rulesHtml() {
    const w = this.w;
    const names: [keyof typeof S, string][] = [
      ['H1', 'Tip Jar'], ['H2', 'Pizza Boxes'], ['H3', 'Scooter'], ['H4', 'Pizza'], ['L1', 'A'], ['L2', 'K'], ['L3', 'Q'], ['L4', 'J'], ['L5', '10'],
    ];
    const x = (v: number) => `${(v / 100).toFixed(2).replace(/\.?0+$/, '')}x`;
    const rows = names
      .map(([c, n]) => {
        const p = PAYTABLE[S[c]];
        return `<tr><td><img src="anims/${c}/corps.webp" alt=""></td><td>${n}</td><td>${x(p[0])}</td><td>${x(p[1])}</td><td>${x(p[2])}</td></tr>`;
      })
      .join('');
    const rushMax = RUSH_COUNTS[RUSH_COUNTS.length - 1][0];
    return `
      <h2>PIZZA RUSH</h2>
      <p class="lead">5 reels × 4 rows · 1024 ways · max win <b>${WINCAP_X.toLocaleString('en-US')}x</b> · RTP <b>${(TARGET_RTP * 100).toFixed(2)}%</b></p>
      <h3>${w.paytable}</h3>
      <p>Wins ${w.pays.toLowerCase()} left to right on adjacent reels, starting from the leftmost reel. Values are per way, for 3, 4 and 5 of a kind, multiplied by the ${w.bet.toLowerCase()} and by the number of ways.</p>
      <table class="pay"><tr><th></th><th></th><th>3</th><th>4</th><th>5</th></tr>${rows}</table>
      <h3><img src="anims/WD/corps.webp" alt=""> GOLDEN SLICE WILD</h3>
      <p>Appears on reels 2 to 5 and substitutes for every symbol except the Phone Order scatter.</p>
      <h3>RUSH HOUR</h3>
      <p>On any base game spin, Tony may speed by on his scooter and turn 1 to ${rushMax} symbols of reels 2 to 5 into Golden Slice Wilds.</p>
      <h3><img src="anims/SC/corps.webp" alt=""> FREE SPINS</h3>
      <p>3, 4 or 5 Phone Order scatters award <b>LUNCH RUSH</b> (${TIERS[1].spins} free spins), <b>DINNER RUSH</b> (${TIERS[2].spins} free spins, tip jar starts with ${TIERS[2].startTips} tips) or <b>MIDNIGHT RUSH</b> (${TIERS[3].spins} free spins, starts with ${TIERS[3].startTips} tips).</p>
      <p><b>TIP JAR</b>: every Wild that lands during free spins drops a tip in the jar. Each tip raises the win multiplier: ${TIP_MULT.map((m) => `x${m}`).join(' → ')}. The multiplier never resets during the feature. Filling the jar (9 tips) awards +5 free spins once. 3 or more scatters during free spins award +5 free spins.</p>
      <h3>${w.ante}</h3>
      <p>${w.ante} costs 3x the ${w.bet.toLowerCase()} and makes the free spins 5 times more likely. RTP ${(TARGET_RTP * 100).toFixed(2)}%.</p>
      <h3>${w.buy}</h3>
      <p>LUNCH RUSH: 100x the ${w.bet.toLowerCase()}. DINNER RUSH: 300x the ${w.bet.toLowerCase()}. RTP ${(TARGET_RTP * 100).toFixed(2)}%.</p>
      <h3>GENERAL</h3>
      <p>The maximum win is ${WINCAP_X.toLocaleString('en-US')}x the ${w.bet.toLowerCase()}; the round ends when it is reached. Malfunction voids all ${w.pays.toLowerCase()} and plays. Press the space bar to spin.</p>`;
  }
}
