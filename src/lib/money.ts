import type { Money } from '../types/api';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f;
}

/** £1.33 from { amount: 133, currency: 'GBP' }. All money is integer minor units (pence). */
export function formatMoney(m: Money | null | undefined): string {
  if (!m) return '';
  return formatter(m.currency).format(m.amount / 100);
}

/** £1.33 from 133 (pence) in the store currency. */
export function formatPence(pence: number, currency = 'GBP'): string {
  return formatter(currency).format(pence / 100);
}

export const money = (amount: number, currency = 'GBP'): Money => ({ amount, currency });

/** Whole pounds → pence, for price filters entered in pounds. */
export const poundsToPence = (pounds: number) => Math.round(pounds * 100);

/** "1.5 kg" / "750 g" for weights held in grams. */
export function formatGrams(g: number): string {
  return g >= 1000 ? `${Number((g / 1000).toFixed(2))} kg` : `${g} g`;
}
