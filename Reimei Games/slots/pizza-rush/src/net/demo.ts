// Mode démo hors ligne : de vrais tours PIZZA RUSH, générés en direct par le moteur de maths partagé
// (RNG crypto). Utilisé quand le jeu est ouvert sans session Stake (tests en local). Jamais sur Stake.
//   ?demo_force=rush|big|t1|t2|t3  → chaque tour montre cette fonction (pour tester vite)
//   ?demo_force=film                → scénario de démonstration : gain, Rush Hour, gros gain, bonus raté de peu,
//                                     série de pertes (Tony déçu), puis bonus obtenu

import { Engine, NATURAL, cryptoRng } from '../../shared/engine';
import { modeByName, type Tier } from '../../shared/game';
import { DEFAULT_JURISDICTION, type AuthResult, type Backend, type Round } from './backend';

const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50, 75, 100].map(
  (v) => Math.round(v * 1_000_000),
);

export class DemoBackend implements Backend {
  kind = 'demo' as const;
  private balance = 10_000 * 1_000_000;
  private pending = 0;
  private eng = new Engine(cryptoRng());
  private rng = cryptoRng();
  private filmStep = 0;

  constructor(
    private currency = 'EUR',
    private force = '',
  ) {}

  async authenticate(): Promise<AuthResult> {
    return {
      balance: this.balance,
      currency: this.currency,
      betLevels: LEVELS,
      defaultBet: 1_000_000,
      minBet: LEVELS[0],
      maxBet: LEVELS[LEVELS.length - 1],
      stepBet: 10_000,
      jurisdiction: { ...DEFAULT_JURISDICTION },
      round: null,
    };
  }

  private pickTier(): Tier {
    const r = this.rng();
    const s = NATURAL.tierSplit;
    return r < s[3] ? 3 : r < s[3] + s[2] ? 2 : 1;
  }

  async play(amount: number, modeName: string): Promise<{ balance: number; round: Round }> {
    const mode = modeByName(modeName);
    const cost = Math.round(amount * mode.cost);
    if (cost > this.balance) throw Object.assign(new Error('Insufficient balance'), { code: 'ERR_IPB' });
    this.balance -= cost;
    let res;
    const f = this.force;
    if (f === 'film' && mode.kind !== 'buy') res = this.filmRound();
    else if (/^t[123]$/.test(f) && mode.kind !== 'buy') res = this.eng.bonus(Number(f[1]) as Tier, true);
    else if (f === 'rush' || f === 'big') {
      do res = this.eng.noBonus(true);
      while (f === 'rush' ? res.rush === 0 : res.payout < 2000);
    } else if (mode.kind === 'buy') res = mode.golden ? this.eng.bonusWild(mode.tier!, true) : this.eng.bonus(mode.tier!, true);
    else if (mode.kind === 'boost') {
      const boosted = NATURAL.pTrigger * (mode.boost ?? 1);
      res = this.rng() < boosted ? this.eng.bonus(this.pickTier(), true) : this.eng.noBonus(true);
    } else if (mode.kind === 'rush') {
      res = this.rng() < NATURAL.pTrigger ? this.eng.rush(true, this.pickTier()) : this.eng.rush(true);
    } else if (mode.kind === 'mystery') {
      // démo : parts proches des maths publiées (MIDNIGHT 15 %, DINNER ~45 %, sinon pas de commande)
      const r = this.rng();
      res = r < (mode.midnight ?? 0.15) ? this.eng.bonus(3, true) : r < (mode.midnight ?? 0.15) + 0.447 ? this.eng.bonus(2, true) : this.eng.noBonus(true);
    } else res = this.eng.natural(true);
    this.pending = Math.round((amount * res.payout) / 100);
    await new Promise((r) => setTimeout(r, 80));
    return {
      balance: this.balance,
      round: { amount, payoutMultiplier: res.payout / 100, active: res.payout > 0, mode: mode.name, state: res.events! },
    };
  }

  private filmRound() {
    const FILM = ['gain', 'perte', 'rush', 'big', 'perte', 'presque', 'perte', 'perte', 'perte', 'perte', 'bonus'];
    const step = FILM[Math.min(this.filmStep++, FILM.length - 1)];
    const sc = (r: ReturnType<Engine['noBonus']>) => {
      const board = (r.events![0] as { board: string[] }).board;
      return board.map((reel) => (reel.match(/SC/g) ?? []).length);
    };
    const total = (a: number[]) => a.reduce((x, y) => x + y, 0);
    for (let i = 0; i < 200000; i++) {
      if (step === 'bonus') {
        const r = this.eng.bonus(1, true);
        if (r.payout >= 2000 && r.payout <= 8000) return r;
        continue;
      }
      const r = this.eng.noBonus(true);
      const s = sc(r);
      if (step === 'gain' && r.payout >= 300 && r.payout < 1000 && !r.rush && total(s) < 2) return r;
      if (step === 'rush' && r.rush && r.payout >= 200 && r.payout < 1500) return r;
      if (step === 'big' && r.payout >= 2000 && r.payout < 6000 && !r.rush) return r;
      if (step === 'perte' && r.payout === 0 && total(s) < 2) return r;
      // raté de peu : 2 scatters sur les 3 premiers rouleaux (longue anticipation), rien de gagné
      if (step === 'presque' && r.payout === 0 && total(s) === 2 && total(s.slice(0, 3)) === 2) return r;
    }
    return this.eng.natural(true);
  }

  async endRound() {
    this.balance += this.pending;
    this.pending = 0;
    return this.balance;
  }

  async saveEvent() {}
}
