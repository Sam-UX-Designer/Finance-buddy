import { cashAt, depositAccounts } from './balances';
import { addMonthsToKey, istMonthKey, istToISO, istParts, monthEndISO, monthKeyParts } from './dates';
import type { Paise } from './money';
import { pctChange, pctOf } from './money';
import { receivables } from './pairing';
import type { Account, EPFAccount, FinancialState, MFHolding, NavLookup, TermDeposit, Txn } from './types';

export type AssetKind = 'MUTUAL_FUNDS' | 'TERM_DEPOSIT' | 'SAVINGS' | 'EPF' | 'RECEIVABLES';
export type AssetGroup = 'INVESTMENTS' | 'BANK' | 'OTHER';

export interface AssetLine {
  kind: AssetKind;
  label: string;
  group: AssetGroup;
  value: Paise;
  /** Money put in (principal / cost / contributions). Null when not applicable. */
  invested: Paise | null;
  /** Market movement or interest earned on top of `invested`. */
  gain: Paise | null;
  gainPct: number | null;
  accountCount: number;
}

export interface NetWorthSummary {
  assets: Paise;
  liabilities: Paise;
  netWorth: Paise;
  lines: AssetLine[];
  allocation: { kind: AssetKind; label: string; value: Paise; pct: number }[];
}

const LABELS: Record<AssetKind, string> = {
  MUTUAL_FUNDS: 'Mutual Funds',
  TERM_DEPOSIT: 'Fixed Deposits',
  SAVINGS: 'Savings Accounts',
  EPF: 'EPF',
  RECEIVABLES: 'Money lent',
};

export function fdValueAt(fd: TermDeposit, atISO: string): Paise {
  const t = Date.parse(atISO);
  if (t < Date.parse(fd.openedAt)) return 0;
  const end = Math.min(t, Date.parse(fd.maturesAt));
  const years = (end - Date.parse(fd.openedAt)) / (365 * 24 * 3600 * 1000);
  const n = fd.compoundingPerYear;
  return Math.round(fd.principal * Math.pow(1 + fd.ratePct / 100 / n, n * years));
}

export function mfUnitsAt(h: MFHolding, atISO: string): number {
  const t = Date.parse(atISO);
  return h.transactions.filter((x) => Date.parse(x.date) <= t).reduce((s, x) => s + x.units, 0);
}

export function mfCostAt(h: MFHolding, atISO: string): Paise {
  const t = Date.parse(atISO);
  return h.transactions.filter((x) => Date.parse(x.date) <= t).reduce((s, x) => s + x.amount, 0);
}

export function mfValueAt(h: MFHolding, atISO: string, nav?: NavLookup): Paise {
  const units = mfUnitsAt(h, atISO);
  if (units <= 0) return 0;
  const price = nav?.(h.schemeCode, atISO);
  if (price == null) return mfCostAt(h, atISO); // no price history: fall back to cost, never guess
  return Math.round(units * price * 100);
}

export function epfValueAt(epf: EPFAccount, atISO: string): Paise {
  const t = Date.parse(atISO);
  return epf.entries.filter((e) => Date.parse(e.date) <= t).reduce((s, e) => s + e.amount, 0);
}

export function netWorth(state: Pick<FinancialState, 'accounts' | 'holdings' | 'txns' | 'now'>): NetWorthSummary {
  const { accounts, holdings, txns } = state;
  const linkedIds = new Set(accounts.filter((a) => a.linked).map((a) => a.id));
  const mf = holdings.mutualFunds.filter((h) => linkedIds.has(h.accountId));
  const fds = holdings.termDeposits.filter((h) => linkedIds.has(h.accountId));
  const epfs = holdings.epf.filter((h) => linkedIds.has(h.accountId));
  const deposits = depositAccounts(accounts);
  const lines: AssetLine[] = [];

  if (mf.length) {
    const value = mf.reduce((s, h) => s + h.currentValue, 0);
    const invested = mf.reduce((s, h) => s + h.investedAmount, 0);
    lines.push(line('MUTUAL_FUNDS', 'INVESTMENTS', value, invested, new Set(mf.map((h) => h.accountId)).size));
  }
  if (fds.length) {
    const value = fds.reduce((s, h) => s + h.currentValue, 0);
    const invested = fds.reduce((s, h) => s + h.principal, 0);
    lines.push(line('TERM_DEPOSIT', 'BANK', value, invested, fds.length));
  }
  if (deposits.length) {
    const value = deposits.reduce((s, a) => s + a.currentBalance, 0);
    lines.push({ kind: 'SAVINGS', label: LABELS.SAVINGS, group: 'BANK', value, invested: null, gain: null, gainPct: null, accountCount: deposits.length });
  }
  if (epfs.length) {
    const value = epfs.reduce((s, h) => s + h.balance, 0);
    const contributions = epfs.reduce((s, h) => s + h.entries.filter((e) => e.kind === 'CONTRIBUTION').reduce((x, e) => x + e.amount, 0), 0);
    lines.push(line('EPF', 'OTHER', value, contributions, epfs.length));
  }
  const owed = receivables(txns).reduce((s, r) => s + r.outstanding, 0);
  if (owed > 0) {
    lines.push({ kind: 'RECEIVABLES', label: LABELS.RECEIVABLES, group: 'OTHER', value: owed, invested: null, gain: null, gainPct: null, accountCount: 0 });
  }
  const assets = lines.reduce((s, l) => s + l.value, 0);
  const liabilities = 0; // No liability accounts (loans/credit cards) are connected in this version.
  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    lines,
    allocation: lines
      .filter((l) => l.value > 0)
      .map((l) => ({ kind: l.kind, label: l.kind === 'SAVINGS' ? 'Cash' : l.label, value: l.value, pct: pctOf(l.value, assets) })),
  };
}

function line(kind: AssetKind, group: AssetGroup, value: Paise, invested: Paise, accountCount: number): AssetLine {
  const gain = value - invested;
  return { kind, label: LABELS[kind], group, value, invested, gain, gainPct: pctChange(invested, value), accountCount };
}

export interface NetWorthPoint {
  date: string;
  monthKey: string;
  value: Paise;
  cash: Paise;
  investments: Paise;
  other: Paise;
}

/** Net worth at an instant, rebuilt from balances, holdings history and NAVs. */
export function netWorthAt(state: Pick<FinancialState, 'accounts' | 'holdings' | 'txns' | 'navLookup'>, atISO: string): NetWorthPoint {
  const linked = new Set(state.accounts.filter((a) => a.linked).map((a) => a.id));
  const cash = cashAt(state.accounts, state.txns, atISO);
  const mf = state.holdings.mutualFunds.filter((h) => linked.has(h.accountId)).reduce((s, h) => s + mfValueAt(h, atISO, state.navLookup), 0);
  const fd = state.holdings.termDeposits.filter((h) => linked.has(h.accountId)).reduce((s, h) => s + fdValueAt(h, atISO), 0);
  const epf = state.holdings.epf.filter((h) => linked.has(h.accountId)).reduce((s, h) => s + epfValueAt(h, atISO), 0);
  const owed = receivables(state.txns, atISO).reduce((s, r) => s + r.outstanding, 0);
  return {
    date: atISO,
    monthKey: istMonthKey(atISO),
    value: cash + mf + fd + epf + owed,
    cash: cash + fd,
    investments: mf,
    other: epf + owed,
  };
}

/** Month-end net worth for the last `months` months plus today. Earliest point is limited by data history. */
export function netWorthTrend(state: FinancialState, months = 12): NetWorthPoint[] {
  const firstTxn = state.txns.reduce<number>((m, t) => Math.min(m, Date.parse(t.postedAt)), Infinity);
  const nowKey = istMonthKey(state.now);
  const points: NetWorthPoint[] = [];
  for (let i = months; i >= 1; i--) {
    const key = addMonthsToKey(nowKey, -i);
    const end = new Date(Date.parse(monthEndISO(key)) - 1).toISOString();
    if (Number.isFinite(firstTxn) && Date.parse(end) < firstTxn) continue;
    points.push(netWorthAt(state, end));
  }
  const current = netWorth(state);
  const nowPoint = netWorthAt(state, state.now);
  points.push({ ...nowPoint, value: current.netWorth });
  return points;
}

export interface NetWorthChange {
  sinceDate: string;
  from: Paise;
  to: Paise;
  change: Paise;
  changePct: number | null;
  /** Market movement on funds + interest on deposits, EPF and savings. */
  fromMarketAndInterest: Paise;
  /** Everything else: money you saved or spent from income. */
  fromSavings: Paise;
}

/**
 * Change in net worth since the start of the calendar year (or the earliest data point),
 * split into market/interest vs. savings so the two are never mixed without labels (Blueprint §16).
 */
export function netWorthChangeThisYear(state: FinancialState): NetWorthChange {
  const { year } = istParts(state.now);
  const jan1 = istToISO(year, 1, 1);
  const firstTxn = state.txns.reduce<number>((m, t) => Math.min(m, Date.parse(t.postedAt)), Infinity);
  const since = Number.isFinite(firstTxn) && firstTxn > Date.parse(jan1) ? new Date(firstTxn).toISOString() : jan1;
  const start = netWorthAt(state, since);
  const to = netWorth(state).netWorth;
  const linked = new Set(state.accounts.filter((a) => a.linked).map((a) => a.id));
  const tSince = Date.parse(since);
  const tNow = Date.parse(state.now);

  let market = 0;
  for (const h of state.holdings.mutualFunds.filter((x) => linked.has(x.accountId))) {
    const valueThen = mfValueAt(h, since, state.navLookup);
    const purchases = h.transactions.filter((x) => Date.parse(x.date) > tSince && Date.parse(x.date) <= tNow).reduce((s, x) => s + x.amount, 0);
    market += h.currentValue - valueThen - purchases;
  }
  for (const fd of state.holdings.termDeposits.filter((x) => linked.has(x.accountId))) {
    const then = fdValueAt(fd, since);
    const newPrincipal = Date.parse(fd.openedAt) > tSince ? fd.principal : 0;
    market += fd.currentValue - then - newPrincipal;
  }
  for (const epf of state.holdings.epf.filter((x) => linked.has(x.accountId))) {
    market += epf.entries.filter((e) => e.kind === 'INTEREST' && Date.parse(e.date) > tSince && Date.parse(e.date) <= tNow).reduce((s, e) => s + e.amount, 0);
  }
  market += state.txns
    .filter((t) => t.direction === 'CREDIT' && t.categoryId === 'interest' && Date.parse(t.postedAt) > tSince && linked.has(t.accountId))
    .reduce((s, t) => s + t.amount, 0);

  const change = to - start.value;
  return {
    sinceDate: since,
    from: start.value,
    to,
    change,
    changePct: pctChange(start.value, to),
    fromMarketAndInterest: market,
    fromSavings: change - market,
  };
}

/** Month keys between two ISO instants (inclusive), oldest first. */
export function monthKeysBetween(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let key = istMonthKey(fromISO);
  const last = istMonthKey(toISO);
  let guard = 0;
  while (guard++ < 600) {
    out.push(key);
    if (key === last) break;
    key = addMonthsToKey(key, 1);
  }
  return out;
}

export function accountsById(accounts: readonly Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}

export function firstTxnDate(txns: readonly Txn[]): string | null {
  let min = Infinity;
  for (const t of txns) min = Math.min(min, Date.parse(t.postedAt));
  return Number.isFinite(min) ? new Date(min).toISOString() : null;
}

export { monthKeyParts };
