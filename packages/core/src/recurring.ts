import { addDaysISO, addMonthsISO, DAY_MS, istDateKey } from './dates';
import type { Paise } from './money';
import type { CategoryId, Txn, TxnType } from './types';

export type Cadence = 'WEEKLY' | 'EVERY_28_DAYS' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface RecurringSeries {
  key: string;
  merchantKey: string;
  merchantName: string;
  categoryId: CategoryId;
  type: TxnType;
  cadence: Cadence;
  averageAmount: Paise;
  lastAmount: Paise;
  lastDate: string;
  nextDueDate: string;
  occurrences: number;
  accountId: string;
  source: 'DETECTED' | 'USER';
  confidence: number;
  txnIds: string[];
}

const VARIABLE_CATEGORIES = new Set<CategoryId>(['food', 'groceries', 'shopping', 'transport', 'fuel', 'cash', 'entertainment', 'people', 'other']);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function cadenceFor(intervalDays: number): Cadence | null {
  if (intervalDays >= 6 && intervalDays <= 8) return 'WEEKLY';
  if (intervalDays >= 27 && intervalDays < 29.5) return 'EVERY_28_DAYS';
  if (intervalDays >= 29.5 && intervalDays <= 33) return 'MONTHLY';
  if (intervalDays >= 85 && intervalDays <= 97) return 'QUARTERLY';
  if (intervalDays >= 355 && intervalDays <= 375) return 'YEARLY';
  return null;
}

export function nextDue(lastISO: string, cadence: Cadence): string {
  switch (cadence) {
    case 'WEEKLY':
      return addDaysISO(lastISO, 7);
    case 'EVERY_28_DAYS':
      return addDaysISO(lastISO, 28);
    case 'MONTHLY':
      return addMonthsISO(lastISO, 1);
    case 'QUARTERLY':
      return addMonthsISO(lastISO, 3);
    case 'YEARLY':
      return addMonthsISO(lastISO, 12);
  }
}

/** Rolls a due date forward until it is not more than `graceDays` in the past. */
function rollForward(dueISO: string, cadence: Cadence, nowISO: string, graceDays: number): string {
  let due = dueISO;
  let guard = 0;
  while (Date.parse(due) < Date.parse(nowISO) - graceDays * DAY_MS && guard++ < 60) due = nextDue(due, cadence);
  return due;
}

/**
 * Detects recurring outgoing payments (bills, subscriptions, rent, SIPs).
 * A series needs ≥ 3 payments to the same payee at a regular interval with stable amounts
 * (≤ 20% variation). Day-to-day spending categories need a user mark instead.
 * Series whose next payment is overdue by more than 10 days are treated as stopped.
 */
export function detectRecurring(txns: readonly Txn[], nowISO: string): RecurringSeries[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.direction !== 'DEBIT') continue;
    if (t.type !== 'EXPENSE' && t.type !== 'INVESTMENT') continue;
    const key = `${t.merchantKey}|${t.type}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: RecurringSeries[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
    const last = list[list.length - 1]!;
    const userMarked = list.some((t) => t.isRecurring && t.recurringSource === 'USER');
    const userUnmarked = list.some((t) => !t.isRecurring && t.recurringSource === 'USER');
    if (userUnmarked && !userMarked) continue;

    let cadence: Cadence | null = null;
    let confidence = 0;
    if (list.length >= 3 && !VARIABLE_CATEGORIES.has(last.categoryId)) {
      const intervals = list.slice(1).map((t, i) => (Date.parse(t.postedAt) - Date.parse(list[i]!.postedAt)) / DAY_MS);
      const med = median(intervals);
      const c = cadenceFor(med);
      const regular = intervals.filter((d) => Math.abs(d - med) <= Math.max(3, med * 0.12)).length / intervals.length;
      const amounts = list.map((t) => t.amount);
      const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const stable = amounts.every((a) => Math.abs(a - avg) <= avg * 0.2);
      if (c && regular >= 0.75 && stable) {
        cadence = c;
        confidence = Math.min(0.95, 0.6 + list.length * 0.05);
      }
    }
    if (!cadence && userMarked) {
      cadence = 'MONTHLY';
      if (list.length >= 2) {
        const intervals = list.slice(1).map((t, i) => (Date.parse(t.postedAt) - Date.parse(list[i]!.postedAt)) / DAY_MS);
        cadence = cadenceFor(median(intervals)) ?? 'MONTHLY';
      }
      confidence = 1;
    }
    if (!cadence) continue;

    const due = rollForward(nextDue(last.postedAt, cadence), cadence, nowISO, 0);
    const overdueDays = (Date.parse(nowISO) - Date.parse(nextDue(last.postedAt, cadence))) / DAY_MS;
    if (!userMarked && overdueDays > 10) continue; // stopped
    const recent = list.slice(-3);
    out.push({
      key,
      merchantKey: last.merchantKey,
      merchantName: last.merchantName,
      categoryId: last.categoryId,
      type: last.type,
      cadence,
      averageAmount: Math.round(recent.reduce((s, t) => s + t.amount, 0) / recent.length),
      lastAmount: last.amount,
      lastDate: last.postedAt,
      nextDueDate: overdueDays > 0 && overdueDays <= 10 ? nextDue(last.postedAt, cadence) : due,
      occurrences: list.length,
      accountId: last.accountId,
      source: userMarked ? 'USER' : 'DETECTED',
      confidence,
      txnIds: list.map((t) => t.id),
    });
  }
  return out.sort((a, b) => Date.parse(a.nextDueDate) - Date.parse(b.nextDueDate));
}

export interface UpcomingPayment {
  seriesKey: string;
  merchantName: string;
  categoryId: CategoryId;
  type: TxnType;
  amount: Paise;
  dueDate: string;
  dueDateKey: string;
  overdue: boolean;
}

/** Recurring payments due between now (including up to 10 days overdue) and `days` ahead. */
export function upcomingPayments(series: readonly RecurringSeries[], nowISO: string, days = 30): UpcomingPayment[] {
  const until = Date.parse(nowISO) + days * DAY_MS;
  const out: UpcomingPayment[] = [];
  for (const s of series) {
    let due = s.nextDueDate;
    let guard = 0;
    while (Date.parse(due) <= until && guard++ < 40) {
      out.push({
        seriesKey: s.key,
        merchantName: s.merchantName,
        categoryId: s.categoryId,
        type: s.type,
        amount: s.averageAmount,
        dueDate: due,
        dueDateKey: istDateKey(due),
        overdue: Date.parse(due) < Date.parse(nowISO),
      });
      due = nextDue(due, s.cadence);
    }
  }
  return out.sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate));
}

/** Recurring expenses that look like subscriptions (Blueprint §12 "Find"). */
export function subscriptions(series: readonly RecurringSeries[]): RecurringSeries[] {
  return series.filter((s) => s.type === 'EXPENSE' && (s.categoryId === 'subscriptions' || s.categoryId === 'entertainment' || s.categoryId === 'health'));
}

/** Monthly-equivalent cost of a series. */
export function monthlyEquivalent(s: RecurringSeries): Paise {
  switch (s.cadence) {
    case 'WEEKLY':
      return Math.round((s.averageAmount * 52) / 12);
    case 'EVERY_28_DAYS':
      return Math.round((s.averageAmount * 365) / 28 / 12);
    case 'MONTHLY':
      return s.averageAmount;
    case 'QUARTERLY':
      return Math.round(s.averageAmount / 3);
    case 'YEARLY':
      return Math.round(s.averageAmount / 12);
  }
}
