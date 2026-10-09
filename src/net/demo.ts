// Offline demo backend: plays real CLOUDBURST rounds generated live by the
// shared game engine (crypto RNG). Used when the game is opened without a
// Stake Engine session (local dev, previews). Never used on Stake.

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

  constructor(private currency = 'EUR') {}

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
    if (mode.kind === 'buy') res = this.eng.bonus(mode.tier!, true);
    else if (mode.kind === 'ante') {
      const boosted = NATURAL.pTrigger * (mode.boost ?? 1);
      res = this.rng() < boosted ? this.eng.bonus(this.pickTier(), true) : this.eng.noBonus(true);
    } else res = this.eng.natural(true);
    this.pending = Math.round((amount * res.payout) / 100);
    await new Promise((r) => setTimeout(r, 120));
    return {
      balance: this.balance,
      round: {
        amount,
        payoutMultiplier: res.payout / 100,
        active: res.payout > 0,
        mode: mode.name,
        state: res.events!,
      },
    };
  }

  async endRound() {
    this.balance += this.pending;
    this.pending = 0;
    return this.balance;
  }

  async saveEvent() {}
}
