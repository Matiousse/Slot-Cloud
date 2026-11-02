// Currency display, following the Stake Engine currency table.

const META: Record<string, { symbol: string; decimals: number; after?: boolean }> = {
  USD: { symbol: '$', decimals: 2 },
  CAD: { symbol: 'CA$', decimals: 2 },
  JPY: { symbol: '¥', decimals: 0 },
  EUR: { symbol: '€', decimals: 2 },
  RUB: { symbol: '₽', decimals: 2 },
  CNY: { symbol: 'CN¥', decimals: 2 },
  PHP: { symbol: '₱', decimals: 2 },
  INR: { symbol: '₹', decimals: 2 },
  IDR: { symbol: 'Rp', decimals: 0 },
  KRW: { symbol: '₩', decimals: 0 },
  BRL: { symbol: 'R$', decimals: 2 },
  MXN: { symbol: 'MX$', decimals: 2 },
  DKK: { symbol: 'KR', decimals: 2, after: true },
  PLN: { symbol: 'zł', decimals: 2, after: true },
  VND: { symbol: '₫', decimals: 0, after: true },
  TRY: { symbol: '₺', decimals: 2 },
  CLP: { symbol: 'CLP', decimals: 0, after: true },
  ARS: { symbol: 'ARS', decimals: 2, after: true },
  PEN: { symbol: 'S/', decimals: 2, after: true },
  XGC: { symbol: 'GC', decimals: 2 },
  XSC: { symbol: 'SC', decimals: 2 },
};

let currency = 'USD';
export const setCurrency = (c: string) => (currency = c || 'USD');
export const getCurrency = () => currency;

const meta = () => META[currency] ?? { symbol: currency, decimals: 2, after: true };

/** Format an amount given in currency units (e.g. 1.5). */
export function money(amount: number): string {
  const m = meta();
  // keep sub-unit precision when bets are below the default decimals (e.g. 0.05 JPY never happens, but 0.005 BTC-like does)
  const decimals = Math.abs(amount) > 0 && Math.abs(amount) < Math.pow(10, -m.decimals) ? 4 : m.decimals;
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (currency === 'XGC' || currency === 'XSC') return `${n} ${m.symbol}`;
  return m.after ? `${n} ${m.symbol}` : `${m.symbol}${n}`;
}

/** Micro units (RGS) -> currency units. */
export const fromMicro = (v: number) => v / 1_000_000;

/** Win in currency units for a book amount (hundredths of the base bet). */
export const bookToMoney = (bookUnits: number, betMicro: number) => Math.round((betMicro * bookUnits) / 100) / 1_000_000;

export const multiplier = (x: number) => `${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`;
