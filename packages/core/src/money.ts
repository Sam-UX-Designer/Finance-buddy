/**
 * Money is always stored and calculated as integer paise (1 ₹ = 100 paise).
 * Floating point rupees only exist at the edges (display, user input).
 */
export type Paise = number;

export function rupees(value: number): Paise {
  return Math.round(value * 100);
}

export function toRupees(paise: Paise): number {
  return paise / 100;
}

export function sum(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function assertPaise(value: number, label = 'amount'): Paise {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of paise, got ${value}`);
  }
  return value;
}

/** Percentage change from `from` to `to`, rounded to 1 decimal. Null when base is zero. */
export function pctChange(from: Paise, to: Paise): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) / Math.abs(from)) * 1000) / 10;
}

/** Share of `part` in `whole` as a percentage rounded to 1 decimal. */
export function pctOf(part: Paise, whole: Paise): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  let rest = intPart.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${groups.join(',')},${last3}`;
}

export interface FormatOptions {
  /** 'auto' shows paise only when non-zero. Default 'auto'. */
  decimals?: 0 | 2 | 'auto';
  /** Prefix + for positive values (and − for negative). */
  signed?: boolean;
  /** Omit the ₹ symbol. */
  plain?: boolean;
}

/** Formats paise in Indian notation, e.g. 8125454 → "₹81,254.54". */
export function formatINR(paise: Paise, opts: FormatOptions = {}): string {
  const decimals = opts.decimals ?? 'auto';
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const showFraction = decimals === 2 || (decimals === 'auto' && fraction !== 0);
  let wholeStr: string;
  let fracStr = '';
  if (showFraction) {
    wholeStr = groupIndian(String(whole));
    fracStr = `.${String(fraction).padStart(2, '0')}`;
  } else {
    // Round half up to the nearest rupee when hiding paise.
    wholeStr = groupIndian(String(Math.round(abs / 100)));
  }
  const symbol = opts.plain ? '' : '₹';
  const sign = negative ? '−' : opts.signed ? '+' : '';
  return `${sign}${symbol}${wholeStr}${fracStr}`;
}

/** Compact Indian format for charts and tight spaces: ₹6.2L, ₹1.4Cr, ₹42K. */
export function formatINRCompact(paise: Paise): string {
  const negative = paise < 0;
  const r = Math.abs(paise) / 100;
  let out: string;
  if (r >= 1e7) out = `₹${trim(r / 1e7)}Cr`;
  else if (r >= 1e5) out = `₹${trim(r / 1e5)}L`;
  else if (r >= 1e3) out = `₹${trim(r / 1e3)}K`;
  else out = `₹${Math.round(r)}`;
  return negative ? `−${out}` : out;
}

function trim(n: number): string {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

/**
 * Parses user-entered rupee text into paise: "1,20,000.50", "50K", "5L", "5 lakh", "1.5Cr".
 * Returns null if invalid.
 */
export function parseRupeeInput(text: string): Paise | null {
  const cleaned = text.replace(/[₹,\s]/g, '').toLowerCase();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  if (!m) return null;
  const [, num, unit] = m;
  if (!unit) return /^\d+(\.\d{0,2})?$/.test(num!) ? Math.round(Number(num) * 100) : null;
  const mult = UNIT[unit];
  return mult ? Math.round(Number(num) * mult * 100) : null;
}
