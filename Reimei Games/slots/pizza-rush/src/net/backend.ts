// Backends: Stake Engine RGS (production), replay, and an offline demo.
// All amounts here are RGS integers with 6 decimals (1_000_000 = 1.00).

import type { BookEvent } from '../../shared/game';

export const API_MULTIPLIER = 1_000_000;

export interface Jurisdiction {
  socialCasino: boolean;
  disabledFullscreen: boolean;
  disabledTurbo: boolean;
  disabledSuperTurbo: boolean;
  disabledAutoplay: boolean;
  disabledSlamstop: boolean;
  disabledSpacebar: boolean;
  disabledBuyFeature: boolean;
  displayNetPosition: boolean;
  displayRTP: boolean;
  displaySessionTimer: boolean;
  minimumRoundDuration: number;
}

export const DEFAULT_JURISDICTION: Jurisdiction = {
  socialCasino: false,
  disabledFullscreen: false,
  disabledTurbo: false,
  disabledSuperTurbo: false,
  disabledAutoplay: false,
  disabledSlamstop: false,
  disabledSpacebar: false,
  disabledBuyFeature: false,
  displayNetPosition: false,
  displayRTP: false,
  displaySessionTimer: false,
  minimumRoundDuration: 0,
};

export interface Round {
  /** base bet amount (micro units) */
  amount: number;
  payoutMultiplier?: number;
  active: boolean;
  mode: string;
  state: BookEvent[];
  event?: string | null;
}

export interface AuthResult {
  balance: number;
  currency: string;
  betLevels: number[];
  defaultBet: number;
  minBet: number;
  maxBet: number;
  stepBet: number;
  jurisdiction: Jurisdiction;
  round: Round | null;
}

export interface Backend {
  kind: 'rgs' | 'demo' | 'replay';
  authenticate(lang: string): Promise<AuthResult>;
  play(amount: number, mode: string, currency: string): Promise<{ balance: number; round: Round }>;
  endRound(): Promise<number>;
  saveEvent(index: number): Promise<void>;
}

export class RgsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeRound(r: Record<string, unknown> | null | undefined): Round | null {
  if (!r) return null;
  const state = (r.state ?? r.events) as BookEvent[] | undefined;
  if (!Array.isArray(state) || !state.length) return null;
  return {
    amount: Number(r.amount ?? 0),
    payoutMultiplier: Number(r.payoutMultiplier ?? 0),
    active: Boolean(r.active),
    mode: String(r.mode ?? 'base'),
    state,
    event: (r.event as string | null) ?? null,
  };
}

// ---------------------------------------------------------------- RGS

export class RgsBackend implements Backend {
  kind = 'rgs' as const;
  constructor(
    private rgsUrl: string,
    private sessionID: string,
  ) {}

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const host = this.rgsUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new RgsError('ERR_NETWORK', 'Network error');
    }
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    const err = (data.error ?? (res.ok ? null : data.code ?? `HTTP_${res.status}`)) as string | { code?: string; message?: string } | null;
    if (err) {
      const code = typeof err === 'string' ? err : err.code ?? 'ERR_GEN';
      const message = typeof err === 'string' ? String(data.message ?? err) : err.message ?? code;
      throw new RgsError(code, message);
    }
    return data as T;
  }

  async authenticate(lang: string): Promise<AuthResult> {
    const d = await this.post<any>('/wallet/authenticate', { sessionID: this.sessionID, language: lang });
    const cfg = d.config ?? {};
    const levels: number[] = (cfg.betLevels ?? []).map(Number).filter((v: number) => v > 0);
    return {
      balance: Number(d.balance?.amount ?? 0),
      currency: String(d.balance?.currency ?? 'USD'),
      betLevels: levels,
      defaultBet: Number(cfg.defaultBetLevel ?? levels[0] ?? 1_000_000),
      minBet: Number(cfg.minBet ?? levels[0] ?? 100_000),
      maxBet: Number(cfg.maxBet ?? levels[levels.length - 1] ?? 1_000_000_000),
      stepBet: Number(cfg.stepBet ?? 10_000),
      jurisdiction: { ...DEFAULT_JURISDICTION, ...(cfg.jurisdiction ?? {}) },
      round: normalizeRound(d.round),
    };
  }

  async play(amount: number, mode: string, currency: string) {
    const d = await this.post<any>('/wallet/play', { sessionID: this.sessionID, amount, mode, currency });
    const round = normalizeRound(d.round);
    if (!round) throw new RgsError('ERR_STATE', 'Empty round state');
    return { balance: Number(d.balance?.amount ?? 0), round };
  }

  async endRound() {
    const d = await this.post<any>('/wallet/end-round', { sessionID: this.sessionID });
    return Number(d.balance?.amount ?? 0);
  }

  async saveEvent(index: number) {
    try {
      await this.post('/bet/event', { sessionID: this.sessionID, event: String(index) });
    } catch {
      /* progress tracking is best-effort */
    }
  }
}

// ---------------------------------------------------------------- replay

export async function fetchReplay(rgsUrl: string, game: string, version: string, mode: string, event: string): Promise<Round> {
  const host = rgsUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const res = await fetch(`https://${host}/bet/replay/${game}/${version}/${mode}/${event}`);
  if (!res.ok) throw new RgsError(`HTTP_${res.status}`, 'Replay not found');
  const d = await res.json();
  const round = normalizeRound(d.round ?? d);
  if (!round) throw new RgsError('ERR_STATE', 'Empty replay');
  return { ...round, mode, active: false };
}
