import type { Paise } from './money';
import type { CategoryId, Direction, Txn, TxnType } from './types';

/** One accounting line. A split transaction produces several entries; others produce one. */
export interface LedgerEntry {
  txnId: string;
  accountId: string;
  postedAt: string;
  amount: Paise;
  direction: Direction;
  type: TxnType;
  categoryId: CategoryId;
  merchantKey: string;
  merchantName: string;
  counterparty: string | null;
}

export function entriesOf(txn: Txn): LedgerEntry[] {
  const base = {
    txnId: txn.id,
    accountId: txn.accountId,
    postedAt: txn.postedAt,
    direction: txn.direction,
    merchantKey: txn.merchantKey,
    merchantName: txn.merchantName,
  };
  if (txn.splits && txn.splits.length > 0) {
    return txn.splits.map((s) => ({
      ...base,
      amount: s.amount,
      type: s.type,
      categoryId: s.categoryId,
      counterparty: s.counterparty ?? txn.counterparty ?? null,
    }));
  }
  return [
    {
      ...base,
      amount: txn.amount,
      type: txn.type,
      categoryId: txn.categoryId,
      counterparty: txn.counterparty ?? null,
    },
  ];
}

export function ledger(txns: readonly Txn[]): LedgerEntry[] {
  return txns.flatMap(entriesOf);
}

/** Signed effect on the account balance: credits add, debits subtract. */
export function signed(amount: Paise, direction: Direction): Paise {
  return direction === 'CREDIT' ? amount : -amount;
}

export interface PeriodTotals {
  income: Paise;
  /** Gross expenses before refunds. */
  expenses: Paise;
  refunds: Paise;
  /** What the user actually spent: expenses − refunds (never below zero). */
  spent: Paise;
  /** Net money moved into investments (purchases − withdrawals). */
  investments: Paise;
  loansGiven: Paise;
  loansRepaid: Paise;
  transfersIn: Paise;
  transfersOut: Paise;
  /** Signed sum of adjustments. */
  adjustments: Paise;
  /**
   * Change in cash across the included accounts:
   * income + refunds + loansRepaid + transfersIn − expenses − investments − loansGiven − transfersOut + adjustments.
   */
  netCashFlow: Paise;
  count: number;
}

export function emptyTotals(): PeriodTotals {
  return {
    income: 0,
    expenses: 0,
    refunds: 0,
    spent: 0,
    investments: 0,
    loansGiven: 0,
    loansRepaid: 0,
    transfersIn: 0,
    transfersOut: 0,
    adjustments: 0,
    netCashFlow: 0,
    count: 0,
  };
}

/**
 * Finance Engine rules (Blueprint §10):
 * - investments are not expenses,
 * - loans given are tracked separately and reduce available cash,
 * - loan repayments are not income,
 * - transfers between own accounts are neither income nor expense.
 */
export function totalsOf(entries: readonly LedgerEntry[]): PeriodTotals {
  const t = emptyTotals();
  const txnIds = new Set<string>();
  for (const e of entries) {
    txnIds.add(e.txnId);
    const credit = e.direction === 'CREDIT';
    switch (e.type) {
      case 'INCOME':
        if (credit) t.income += e.amount;
        else t.income -= e.amount; // income reversal
        break;
      case 'EXPENSE':
        if (credit) t.refunds += e.amount; // a credit marked as expense behaves like a refund
        else t.expenses += e.amount;
        break;
      case 'REFUND':
        if (credit) t.refunds += e.amount;
        else t.expenses += e.amount;
        break;
      case 'INVESTMENT':
        t.investments += credit ? -e.amount : e.amount;
        break;
      case 'LOAN_GIVEN':
        if (credit) t.loansRepaid += e.amount;
        else t.loansGiven += e.amount;
        break;
      case 'LOAN_REPAID':
        if (credit) t.loansRepaid += e.amount;
        else t.loansGiven += e.amount;
        break;
      case 'TRANSFER':
        if (credit) t.transfersIn += e.amount;
        else t.transfersOut += e.amount;
        break;
      case 'ADJUSTMENT':
        t.adjustments += signed(e.amount, e.direction);
        break;
    }
  }
  t.spent = Math.max(0, t.expenses - t.refunds);
  t.netCashFlow =
    t.income + t.refunds + t.loansRepaid + t.transfersIn - t.expenses - t.investments - t.loansGiven - t.transfersOut + t.adjustments;
  t.count = txnIds.size;
  return t;
}

export function inRange(entries: readonly LedgerEntry[], fromISO: string, toISO: string): LedgerEntry[] {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  return entries.filter((e) => {
    const t = Date.parse(e.postedAt);
    return t >= from && t < to;
  });
}

export interface CategorySpend {
  categoryId: CategoryId;
  /** Net spent in the category (expenses − refunds). */
  spent: Paise;
  count: number;
}

/** Spending per category, net of refunds, sorted descending. */
export function spendByCategory(entries: readonly LedgerEntry[]): CategorySpend[] {
  const map = new Map<CategoryId, CategorySpend>();
  for (const e of entries) {
    if (e.type !== 'EXPENSE' && e.type !== 'REFUND') continue;
    const row = map.get(e.categoryId) ?? { categoryId: e.categoryId, spent: 0, count: 0 };
    const isRefund = e.type === 'REFUND' ? e.direction === 'CREDIT' : e.direction === 'CREDIT';
    row.spent += isRefund ? -e.amount : e.amount;
    if (!isRefund) row.count += 1;
    map.set(e.categoryId, row);
  }
  return [...map.values()].filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent);
}

export interface MerchantSpend {
  merchantKey: string;
  merchantName: string;
  spent: Paise;
  count: number;
}

export function spendByMerchant(entries: readonly LedgerEntry[]): MerchantSpend[] {
  const map = new Map<string, MerchantSpend>();
  for (const e of entries) {
    if (e.type !== 'EXPENSE' && e.type !== 'REFUND') continue;
    const row = map.get(e.merchantKey) ?? { merchantKey: e.merchantKey, merchantName: e.merchantName, spent: 0, count: 0 };
    const isRefund = e.direction === 'CREDIT';
    row.spent += isRefund ? -e.amount : e.amount;
    if (!isRefund) row.count += 1;
    map.set(e.merchantKey, row);
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent);
}
