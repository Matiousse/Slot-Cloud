// Interface (DOM, nette à toutes les tailles) : barre de commande, achat du bonus, règles, messages.
// Mode « social casino » de Stake : les mots interdits (bet, buy, pay…) sont remplacés.
import { money, fromMicro } from '../core/format';
import { PAYTABLE, S, TARGET_RTP, WINCAP_X, TIERS, TIP_MULT, RUSH_COUNTS, GOLDEN_SPINS, modeByName } from '../../shared/game';

const WORDS = {
  normal: { bet: 'BET', buy: 'BUY BONUS', buyShort: 'BUY', pays: 'PAYS', paytable: 'PAYTABLE', cost: 'COST', amount: 'BET AMOUNT', getBonus: 'GET BONUS', funds: 'NOT ENOUGH BALANCE' },
  social: { bet: 'SPIN', buy: 'PLAY BONUS', buyShort: 'PLAY', pays: 'AWARDS', paytable: 'AWARD TABLE', cost: 'PRICE', amount: 'PLAY AMOUNT', getBonus: 'GET BONUS', funds: 'NOT ENOUGH BALANCE' },
};

export interface HudEvents {
  spin(): void;
  bet(dir: -1 | 1): void;
  /** mode qui reste actif à chaque spin (boost, rush, mystery), null = jeu normal */
  feature(mode: string | null): void;
  buy(mode: string): void;
  turbo(on: boolean): void;
  auto(n: number): void;
  sound(on: boolean): void;
}

const AUTO_STEPS = [0, 10, 25, 50, 100];

// Les 6 vignettes de l'écran bonus (même disposition que la référence de l'utilisateur).
const CARDS: { mode: string; title: string; icon: string; text: () => string }[] = [
  { mode: 'boost', title: 'TIP BOOST', icon: 'H1', text: () => `Free spins trigger ${modeByName('boost').boost}× as often. Stays on until you switch it off.` },
  { mode: 'superboost', title: 'ORDER BOOST', icon: 'SC', text: () => `Free spins trigger ${modeByName('superboost').boost}× as often. Stays on until you switch it off.` },
  { mode: 'rush', title: 'GUARANTEED RUSH', icon: 'WD', text: () => 'Every spin Tony drops 2 to 4 GOLDEN SLICE WILDS. Stays on until you switch it off.' },
  { mode: 'bonus', title: 'LUNCH RUSH BONUS', icon: 'H4', text: () => `${TIERS[1].spins} free spins · TIP JAR from ×1, never resets · every Wild adds a tip.` },
  { mode: 'super', title: 'DINNER RUSH BONUS', icon: 'H3', text: () => `${GOLDEN_SPINS} free spins · TIP JAR from ×${TIP_MULT[TIERS[2].startTips]} · a guaranteed GOLDEN SLICE WILD every spin.` },
  { mode: 'mystery', title: 'MYSTERY ORDER', icon: 'H2', text: () => 'Every spin the phone rings: NO ORDER, DINNER RUSH or MIDNIGHT RUSH free spins. Stays on until you switch it off.' },
];

// Icônes (traits épais arrondis, style cartoon) et emblème du studio Reimei Games (soleil levant 黎明).
const sv = (d: string) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  sound: sv('<path d="M8 19h8l10-8v26l-10-8H8z" fill="currentColor"/><path d="M33 17a10 10 0 0 1 0 14M38 12a17 17 0 0 1 0 24"/>'),
  info: sv('<path d="M24 21v15"/><circle cx="24" cy="12" r="1.5" fill="currentColor"/>'),
  turbo: sv('<path d="M27 5 11 27h12l-3 16 17-23H25z" fill="currentColor" stroke-width="3"/>'),
  auto: sv('<path d="M38 24a14 14 0 1 1-4-9.9"/><path d="M36 6v9h-9"/><path d="M21 18l9 6-9 6z" fill="currentColor" stroke-width="2"/>'),
  spin: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M50 26A19 19 0 0 0 15 20"/><path d="M14 38a19 19 0 0 0 35 6"/><path d="M52 12v14H38" /><path d="M12 52V38h14"/></svg>`,
};
// Cadres « verre » biseautés : un polygone SVG étiré sur le bouton, trait fin blanc qui garde son épaisseur.
const poly = (pts: string) =>
  `<svg class="fr" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${pts}" vector-effect="non-scaling-stroke"/><polygon class="in" points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
const FR = {
  left: poly('2,2 98,9 90,98 2,98'), // gros panneau de gauche : bord droit en biais
  right: poly('2,9 98,2 98,98 10,98'), // gros panneau de droite : bord gauche en biais
  sq: poly('7,3 97,8 93,97 3,92'), // petits boutons : losange léger
  pill: poly('4,6 98,2 96,94 2,98'),
};
const REIMEI = `<svg class="reimei" viewBox="0 0 120 92" aria-label="Reimei Games">
  <defs><linearGradient id="rmSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd65a"/><stop offset=".55" stop-color="#ff7a2a"/><stop offset="1" stop-color="#e2302a"/></linearGradient>
  <clipPath id="rmCut"><rect x="0" y="0" width="120" height="50"/></clipPath></defs>
  <g stroke="#1b0f14" stroke-width="4">
    <g clip-path="url(#rmCut)"><circle cx="60" cy="50" r="30" fill="url(#rmSun)"/></g>
    <path d="M32 37h56M36 44h48" stroke="#1b0f14" stroke-width="3"/>
    <path d="M14 50h92" stroke-width="5"/>
  </g>
  <path d="M14 50h92" stroke="#ffd65a" stroke-width="2"/>
  <g stroke="#ffd65a" stroke-width="3" stroke-linecap="round" opacity=".9"><path d="M60 6v8M34 14l5 6M86 14l-5 6M18 30l7 3M102 30l-7 3"/></g>
  <text x="60" y="80" text-anchor="middle" class="rm-t">REIMEI</text>
</svg>`;

export class Hud {
  private w = WORDS.normal;
  private el: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private feature: string | null = null;
  private balance = 0;
  private turboOn = false;
  private soundOn = (() => { try { return localStorage.getItem('pizza-rush-sound') !== 'off'; } catch { return true; } })();
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
      <div class="corner left">
        <div class="toprow">
          <button class="glass mini" data-a="sound" title="Sound">${FR.sq}${ICON.sound}</button>
          <button class="glass mini" data-a="info" title="Rules">${FR.sq}${ICON.info}</button>
          <button class="glass ante feat" data-a="feat">${FR.sq}<i></i><span data-v="featName">FEATURES<small>OFF</small></span></button>
        </div>
        <button class="glass big buy" data-a="buy">${FR.left}${REIMEI}<b>${w.buy}</b></button>
        <div class="val bal"><span>BALANCE</span><b data-v="balance">–</b></div>
      </div>
      <div class="winbox">${FR.pill}<span>WIN</span><b data-v="win"></b></div>
      <div class="corner right">
        <div class="val betv"><span>${w.bet}</span><b data-v="bet">–</b></div>
        <div class="pm">
          <button class="glass sq" data-a="plus" aria-label="+">${FR.sq}<em>+</em></button>
          <button class="glass sq" data-a="minus" aria-label="−">${FR.sq}<em>−</em></button>
        </div>
        <div class="spincol">
          <div class="tools">
            <button class="glass mini" data-a="auto" title="Auto">${FR.sq}<span data-v="auto">${ICON.auto}</span></button>
            <button class="glass mini" data-a="turbo" title="Turbo">${FR.sq}${ICON.turbo}</button>
          </div>
          <button class="glass big spin" data-a="spin" aria-label="Spin">${FR.right}${ICON.spin}</button>
        </div>
      </div>
      <div class="modal features" data-m="buy"><div class="fscreen">
        <div class="famount"><span>${w.amount}</span>
          <div class="frow"><button class="fround" data-a="minus" aria-label="−">−</button><b data-v="famount">–</b><button class="fround" data-a="plus" aria-label="+">+</button></div>
        </div>
        <div class="fcards">
          ${CARDS.map((c) => {
            const m = modeByName(c.mode);
            return `<div class="fcard" data-card="${c.mode}">
              <h4>${c.title}</h4><p>${c.text()}</p>
              <img src="anims/${c.icon}/corps.webp" alt="">
              <div class="every">${m.cost}× ${m.persistent ? 'every spin' : ''}</div>
              <div class="fprice" data-price="${m.cost}">–</div>
              <button class="fbtn" data-feat="${c.mode}">${m.persistent ? 'ACTIVATE' : w.getBonus}</button>
              <div class="nb">${w.funds}</div>
            </div>`;
          }).join('')}
        </div>
        <button class="close fclose" data-a="close">✕</button>
      </div></div>
      <div class="modal" data-m="info"><div class="card rules">${this.rulesHtml()}<button class="close" data-a="close">✕</button></div></div>
      <div class="toast" data-v="toast"></div>`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', (e) => this.click(b.dataset.a!, e)));
    this.el.querySelectorAll<HTMLButtonElement>('[data-feat]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pickFeature(b.dataset.feat!);
      }),
    );
    this.refreshToggles();
    this.setBet(this.bet);
  }

  /** Vignette choisie : un achat part tout de suite ; un mode permanent s'active (ou se coupe s'il était actif). */
  private pickFeature(mode: string) {
    const m = modeByName(mode);
    if (Math.round(this.bet * m.cost) > this.balance && this.feature !== mode) return;
    this.closeAll();
    if (!m.persistent) return this.ev.buy(mode);
    this.setFeature(this.feature === mode ? null : mode);
    this.ev.feature(this.feature);
  }

  private refreshCards() {
    const amount = this.q('[data-v="famount"]');
    if (amount) amount.textContent = money(fromMicro(this.bet));
    this.el.querySelectorAll<HTMLElement>('.fcard').forEach((card) => {
      const mode = card.dataset.card!;
      const m = modeByName(mode);
      const price = Math.round(this.bet * m.cost);
      const on = this.feature === mode;
      const broke = price > this.balance && !on;
      card.querySelector('.fprice')!.textContent = money(fromMicro(price));
      card.classList.toggle('on', on);
      card.classList.toggle('broke', broke);
      const btn = card.querySelector<HTMLButtonElement>('.fbtn')!;
      btn.textContent = on ? 'SWITCH OFF' : m.persistent ? 'ACTIVATE' : this.w.getBonus;
      btn.disabled = broke;
    });
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
      case 'feat':
        if (this.feature) {
          this.setFeature(null);
          return this.ev.feature(null);
        }
        if (!this.canBuy) return;
        this.refreshCards();
        return this.open('buy');
      case 'buy':
        if (!this.canBuy) return;
        this.refreshCards();
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
    this.q('[data-a="feat"]').classList.toggle('on', !!this.feature);
    const card = CARDS.find((c) => c.mode === this.feature);
    this.q('[data-v="featName"]').innerHTML = card ? `${card.title}<small>ON · TAP TO STOP</small>` : 'FEATURES<small>OFF</small>';
    this.q('[data-a="turbo"]').classList.toggle('on', this.turboOn);
    this.q('[data-a="sound"]').classList.toggle('off', !this.soundOn);
    this.q('[data-a="buy"]').classList.toggle('disabled', !this.canBuy);
  }

  setAuto(n: number) {
    this.autoIdx = Math.max(0, AUTO_STEPS.indexOf(n));
    const el = this.q('[data-v="auto"]');
    el.innerHTML = n ? String(n) : ICON.auto;
    this.q('[data-a="auto"]').classList.toggle('on', n > 0);
  }

  setBalance(micro: number) {
    this.balance = micro;
    this.q('[data-v="balance"]').textContent = money(fromMicro(micro));
    this.refreshCards();
  }
  setWin(micro: number | null) {
    this.q('[data-v="win"]').textContent = micro ? money(fromMicro(micro)) : '';
  }
  setBet(micro: number) {
    this.bet = micro;
    // avec un mode permanent, chaque spin coûte la mise × le coût du mode : c'est ce qu'on affiche
    const shown = this.feature ? Math.round(micro * modeByName(this.feature).cost) : micro;
    this.q('[data-v="bet"]').textContent = money(fromMicro(shown));
    this.refreshCards();
  }
  setFeature(mode: string | null) {
    this.feature = mode;
    this.refreshToggles();
    this.setBet(this.bet);
  }
  setBusy(busy: boolean, freeSpins = false) {
    this.el.classList.toggle('busy', busy);
    this.el.classList.toggle('fs', freeSpins);
    this.q('[data-a="spin"]').classList.toggle('spinning', busy);
    if (busy && !this.wasBusy) this.turnSpinIcon();
    this.wasBusy = busy;
  }
  /** Un seul tour complet de l'icône de spin à chaque lancement (départ vif, arrivée douce), piloté par
   *  requestAnimationFrame pour suivre l'horloge de la page. */
  private wasBusy = false;
  private turnSpinIcon() {
    const icon = this.q('[data-a="spin"]').querySelector<SVGElement>('svg:not(.fr)');
    if (!icon) return;
    const DUREE = 650;
    const t0 = performance.now();
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / DUREE);
      const e = 1 - Math.pow(1 - u, 3); // ease-out
      icon.style.transform = `rotate(${e * 360}deg)`;
      if (u < 1) requestAnimationFrame(step);
      else icon.style.transform = '';
    };
    requestAnimationFrame(step);
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
      <h3>${w.buy}</h3>
      ${CARDS.map((c) => {
        const m = modeByName(c.mode);
        return `<p><b>${c.title}</b> (${m.cost}x the ${w.bet.toLowerCase()}${m.persistent ? ' on every spin' : ''}): ${c.text()}</p>`;
      }).join('')}
      <p>Every feature has an RTP of ${(TARGET_RTP * 100).toFixed(2)}%.</p>
      <h3>GENERAL</h3>
      <p>The maximum win is ${WINCAP_X.toLocaleString('en-US')}x the ${w.bet.toLowerCase()}; the round ends when it is reached. Malfunction voids all ${w.pays.toLowerCase()} and plays. Press the space bar to spin.</p>`;
  }
}
