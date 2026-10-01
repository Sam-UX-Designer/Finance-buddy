import { depositAccounts } from './balances';
import { addMonthsToKey, DAY_MS, istMonthKey, monthEndISO, monthStartISO } from './dates';
import {
  inRange,
  ledger,
  spendByCategory,
  spendByMerchant,
  totalsOf,
  type CategorySpend,
  type LedgerEntry,
  type MerchantSpend,
  type PeriodTotals,
} from './ledger';
import type { Paise } from './money';
import { pctChange } from './money';
import type { CategoryId, FinancialState, Txn } from './types';

/** Ledger entries for transactions on linked deposit accounts (the user's cash picture). */
export function cashLedger(state: Pick<FinancialState, 'accounts' | 'txns'>): LedgerEntry[] {
  const ids = new Set(depositAccounts(state.accounts).map((a) => a.id));
  return ledger(state.txns.filter((t) => ids.has(t.accountId)));
}

export interface PeriodSummary extends PeriodTotals {
  from: string;
  to: string;
  byCategory: CategorySpend[];
  topMerchants: MerchantSpend[];
  /** (income − spent) ÷ income, as a percentage. Null without income. */
  savingsRatePct: number | null;
}

export function summarize(entries: readonly LedgerEntry[], fromISO: string, toISO: string): PeriodSummary {
  const scoped = inRange(entries, fromISO, toISO);
  const totals = totalsOf(scoped);
  return {
    ...totals,
    from: fromISO,
    to: toISO,
    byCategory: spendByCategory(scoped),
    topMerchants: spendByMerchant(scoped).slice(0, 5),
    savingsRatePct: totals.income > 0 ? Math.round(((totals.income - totals.spent) / totals.income) * 1000) / 10 : null,
  };
}

/** Calendar-month summary in IST. For the current month the period ends at `now`. */
export function monthSummary(state: Pick<FinancialState, 'accounts' | 'txns' | 'now'>, monthKey = istMonthKey(state.now)): PeriodSummary {
  const from = monthStartISO(monthKey);
  const end = monthEndISO(monthKey);
  const to = Date.parse(end) > Date.parse(state.now) ? state.now : end;
  // `to` is exclusive; include transactions at exactly `now`.
  const toExclusive = to === state.now ? new Date(Date.parse(to) + 1).toISOString() : to;
  const s = summarize(cashLedger(state), from, toExclusive);
  return { ...s, to };
}

export interface MonthComparison {
  current: PeriodSummary;
  previous: PeriodSummary;
  spentChangePct: number | null;
  incomeChangePct: number | null;
  categoryChanges: { categoryId: CategoryId; current: Paise; previous: Paise; change: Paise; changePct: number | null }[];
  /** True when the current month is still in progress and compared like-for-like up to the same day. */
  monthToDate: boolean;
}

/**
 * Compares the current month with the previous one. If the current month is in progress,
 * the previous month is cut at the same day-of-month so the comparison is fair.
 */
export function compareWithPreviousMonth(state: Pick<FinancialState, 'accounts' | 'txns' | 'now'>, monthKey = istMonthKey(state.now)): MonthComparison {
  const entries = cashLedger(state);
  const current = monthSummary(state, monthKey);
  const prevKey = addMonthsToKey(monthKey, -1);
  const inProgress = istMonthKey(state.now) === monthKey;
  let previous: PeriodSummary;
  if (inProgress) {
    const elapsed = Date.parse(state.now) - Date.parse(monthStartISO(monthKey));
    const prevStart = monthStartISO(prevKey);
    const prevEnd = Math.min(Date.parse(prevStart) + elapsed + 1, Date.parse(monthEndISO(prevKey)));
    previous = summarize(entries, prevStart, new Date(prevEnd).toISOString());
  } else {
    previous = monthSummary(state, prevKey);
  }
  const cats = new Set<CategoryId>([...current.byCategory, ...previous.byCategory].map((c) => c.categoryId));
  const categoryChanges = [...cats]
    .map((categoryId) => {
      const cur = current.byCategory.find((c) => c.categoryId === categoryId)?.spent ?? 0;
      const prev = previous.byCategory.find((c) => c.categoryId === categoryId)?.spent ?? 0;
      return { categoryId, current: cur, previous: prev, change: cur - prev, changePct: pctChange(prev, cur) };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return {
    current,
    previous,
    spentChangePct: pctChange(previous.spent, current.spent),
    incomeChangePct: pctChange(previous.income, current.income),
    categoryChanges,
    monthToDate: inProgress,
  };
}

/** Months (oldest first) fully covered by transaction history before the current month. */
export function completeMonthsWithData(txns: readonly Txn[], nowISO: string, max = 12): string[] {
  let first = Infinity;
  for (const t of txns) first = Math.min(first, Date.parse(t.postedAt));
  if (!Number.isFinite(first)) return [];
  const nowKey = istMonthKey(nowISO);
  const out: string[] = [];
  for (let i = max; i >= 1; i--) {
    const key = addMonthsToKey(nowKey, -i);
    // A month counts as covered when history starts within its first 3 days.
    if (Date.parse(monthStartISO(key)) + 3 * DAY_MS >= first) out.push(key);
  }
  return out;
}

/** Spend per category for a month-to-date window (day 1 → same day/time) in a past month. */
export function sameWindowSpend(entries: readonly LedgerEntry[], monthKey: string, nowISO: string): CategorySpend[] {
  const start = monthStartISO(monthKey);
  const elapsed = Date.parse(nowISO) - Date.parse(monthStartISO(istMonthKey(nowISO)));
  const end = Math.min(Date.parse(start) + elapsed + 1, Date.parse(monthEndISO(monthKey)));
  return spendByCategory(inRange(entries, start, new Date(end).toISOString()));
}
