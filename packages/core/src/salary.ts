import { cashAt, depositAccounts } from './balances';
import { addMonthsISO, istParts } from './dates';
import { ledger, totalsOf, type PeriodTotals } from './ledger';
import type { Paise } from './money';
import type { Account, Txn } from './types';

export interface SalaryInfo {
  merchantKey: string;
  payer: string;
  /** Median of the last three credits. */
  amount: Paise;
  typicalDay: number;
  lastCreditedAt: string;
  nextExpectedAt: string;
  occurrences: number;
  creditIds: string[];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Detects the salary stream: the most frequent salary-category income source (≥ 2 credits). */
export function detectSalary(txns: readonly Txn[]): SalaryInfo | null {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.direction !== 'CREDIT' || t.type !== 'INCOME' || t.categoryId !== 'salary') continue;
    const list = groups.get(t.merchantKey) ?? [];
    list.push(t);
    groups.set(t.merchantKey, list);
  }
  let best: Txn[] | null = null;
  for (const list of groups.values()) {
    if (list.length >= 2 && (!best || list.length > best.length)) best = list;
  }
  if (!best) return null;
  best.sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  const last = best[best.length - 1]!;
  const recent = best.slice(-3);
  return {
    merchantKey: last.merchantKey,
    payer: last.merchantName,
    amount: median(recent.map((t) => t.amount)),
    typicalDay: median(recent.map((t) => istParts(t.postedAt).day)),
    lastCreditedAt: last.postedAt,
    nextExpectedAt: addMonthsISO(last.postedAt, 1),
    occurrences: best.length,
    creditIds: best.map((t) => t.id),
  };
}

export interface SalaryCycle extends PeriodTotals {
  start: string;
  /** Exclusive end — the next salary credit, or `now` for the current cycle. */
  end: string;
  salaryTxnId: string;
  /** Actual cash just before this salary landed (= previous cycle's actual closing). */
  opening: Paise;
  /** opening + netCashFlow */
  closingComputed: Paise;
  /** Actual cash at the end of the cycle (from bank balances). */
  closingActual: Paise;
  /** closingActual − closingComputed. Non-zero means the data is incomplete; history is never edited. */
  unreconciled: Paise;
  isCurrent: boolean;
}

/**
 * Salary cycles (Blueprint §11):
 * opening + income − expenses − investments − loans given + loan repayments (± refunds, transfers,
 * adjustments) = available balance. Only connected savings/current accounts are included.
 */
export function salaryCycles(accounts: readonly Account[], txns: readonly Txn[], nowISO: string): SalaryCycle[] {
  const salary = detectSalary(txns);
  if (!salary) return [];
  const depositIds = new Set(depositAccounts(accounts).map((a) => a.id));
  const depositTxns = txns.filter((t) => depositIds.has(t.accountId));
  const starts = depositTxns
    .filter((t) => salary.creditIds.includes(t.id))
    .sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  const entries = ledger(depositTxns);
  const cycles: SalaryCycle[] = [];
  starts.forEach((s, i) => {
    const next = starts[i + 1];
    const start = s.postedAt;
    const end = next ? next.postedAt : nowISO;
    const tStart = Date.parse(start);
    const tEnd = Date.parse(end);
    // Entries at the exact start instant belong to this cycle; entries at the next salary instant to the next.
    const inCycle = entries.filter((e) => {
      const t = Date.parse(e.postedAt);
      return t >= tStart && (next ? t < tEnd : t <= tEnd);
    });
    const totals = totalsOf(inCycle);
    const opening = cashAt(accounts, depositTxns, new Date(tStart - 1).toISOString());
    const closingActual = next ? cashAt(accounts, depositTxns, new Date(tEnd - 1).toISOString()) : cashAt(accounts, depositTxns, end);
    const closingComputed = opening + totals.netCashFlow;
    cycles.push({
      ...totals,
      start,
      end,
      salaryTxnId: s.id,
      opening,
      closingComputed,
      closingActual,
      unreconciled: closingActual - closingComputed,
      isCurrent: !next,
    });
  });
  return cycles;
}
