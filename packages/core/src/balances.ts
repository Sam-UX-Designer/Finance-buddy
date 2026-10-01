import { signed } from './ledger';
import type { Paise } from './money';
import { isDepositAccount, type Account, type Txn } from './types';

/** Statement order: time, then the bank's own sequence, then id. */
export function byStatementOrder(a: Txn, b: Txn): number {
  return Date.parse(a.postedAt) - Date.parse(b.postedAt) || (a.seq ?? 0) - (b.seq ?? 0) || a.id.localeCompare(b.id);
}

/** Sum of current balances across linked deposit (savings/current) accounts. */
export function totalCash(accounts: readonly Account[]): Paise {
  return accounts.filter((a) => a.linked && isDepositAccount(a.type)).reduce((s, a) => s + a.currentBalance, 0);
}

export function depositAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((a) => a.linked && isDepositAccount(a.type));
}

/**
 * Balance of an account at a point in time.
 * Uses the bank-reported running balance when available; otherwise derives it from the
 * current (source-of-truth) balance by reversing later transactions.
 */
export function balanceAt(account: Account, txns: readonly Txn[], atISO: string): Paise {
  const at = Date.parse(atISO);
  const own = txns
    .filter((t) => t.accountId === account.id)
    .sort(byStatementOrder);
  let lastBefore: Txn | undefined;
  for (const t of own) {
    if (Date.parse(t.postedAt) <= at) lastBefore = t;
    else break;
  }
  if (lastBefore && lastBefore.balanceAfter != null) return lastBefore.balanceAfter;
  let balance = account.currentBalance;
  for (const t of own) {
    if (Date.parse(t.postedAt) > at) balance -= signed(t.amount, t.direction);
  }
  return balance;
}

export function cashAt(accounts: readonly Account[], txns: readonly Txn[], atISO: string): Paise {
  return depositAccounts(accounts).reduce((s, a) => s + balanceAt(a, txns, atISO), 0);
}

export interface Reconciliation {
  accountId: string;
  status: 'RECONCILED' | 'MISMATCH' | 'UNVERIFIED';
  /** Reported balance minus the balance implied by transactions. Zero when reconciled. */
  difference: Paise;
  checkedTransactions: number;
  breaks: number;
}

/**
 * Verifies that the transaction history agrees with the bank-reported balance (Blueprint §10:
 * actual balance is the source of truth; never modify history to force a match).
 */
export function reconcile(account: Account, txns: readonly Txn[]): Reconciliation {
  const own = txns
    .filter((t) => t.accountId === account.id)
    .sort(byStatementOrder);
  const withBalance = own.filter((t) => t.balanceAfter != null);
  if (own.length === 0 || withBalance.length === 0) {
    return { accountId: account.id, status: 'UNVERIFIED', difference: 0, checkedTransactions: 0, breaks: 0 };
  }
  let breaks = 0;
  let prev: Txn | null = null;
  for (const t of own) {
    if (prev?.balanceAfter != null && t.balanceAfter != null) {
      const expected = prev.balanceAfter + signed(t.amount, t.direction);
      if (expected !== t.balanceAfter) breaks += 1;
    }
    prev = t;
  }
  const last = own[own.length - 1]!;
  const difference = last.balanceAfter != null ? account.currentBalance - last.balanceAfter : 0;
  return {
    accountId: account.id,
    status: breaks === 0 && difference === 0 ? 'RECONCILED' : 'MISMATCH',
    difference,
    checkedTransactions: own.length,
    breaks,
  };
}
