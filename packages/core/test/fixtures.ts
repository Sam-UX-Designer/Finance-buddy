import { classify } from '../src/classify';
import { istToISO } from '../src/dates';
import { applyEnginePasses } from '../src/pairing';
import type { Account, FinancialState, Txn } from '../src/types';

export const NOW = istToISO(2026, 10, 15, 10, 0);

export function account(id: string, last4: string, opening: number, type: Account['type'] = 'SAVINGS'): Account & { opening: number } {
  return {
    id,
    fipId: `fip-${id}`,
    fipName: id.toUpperCase(),
    type,
    maskedNumber: `XXXXXXXX${last4}`,
    displayName: `${id.toUpperCase()} Savings`,
    currentBalance: opening * 100,
    balanceAsOf: NOW,
    linked: true,
    opening,
  };
}

export interface RawSpec {
  accountId: string;
  at: string;
  amount: number; // rupees
  direction: 'DEBIT' | 'CREDIT';
  narration: string;
}

let seq = 0;

/** Builds classified transactions with consistent running balances and updates account balances. */
export function buildTxns(accounts: (Account & { opening: number })[], specs: RawSpec[]): Txn[] {
  const balances = new Map(accounts.map((a) => [a.id, a.opening * 100]));
  const sorted = [...specs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const txns: Txn[] = sorted.map((s, index) => {
    const amount = Math.round(s.amount * 100);
    const bal = balances.get(s.accountId)! + (s.direction === 'CREDIT' ? amount : -amount);
    balances.set(s.accountId, bal);
    const c = classify({ direction: s.direction, narration: s.narration, amount }, { ownAccountLast4: accounts.map((a) => a.maskedNumber.slice(-4)) });
    seq += 1;
    return {
      id: `t${String(seq).padStart(5, '0')}`,
      accountId: s.accountId,
      postedAt: s.at,
      amount,
      direction: s.direction,
      mode: c.mode,
      narration: s.narration,
      merchantKey: c.merchantKey,
      merchantName: c.merchantName,
      counterparty: c.counterparty,
      categoryId: c.categoryId,
      type: c.type,
      confidence: c.confidence,
      typeSource: 'RULE',
      categorySource: 'RULE',
      isRecurring: false,
      balanceAfter: bal,
      seq: index,
    };
  });
  for (const a of accounts) a.currentBalance = balances.get(a.id)!;
  return applyEnginePasses(txns, accounts);
}

export function state(accounts: Account[], txns: Txn[], extra: Partial<FinancialState> = {}): FinancialState {
  return {
    now: NOW,
    user: { id: 'u1', name: 'Sam' },
    accounts,
    txns,
    holdings: { mutualFunds: [], termDeposits: [], epf: [] },
    goals: [],
    budgets: [],
    assumptionOverrides: {},
    partial: false,
    ...extra,
  };
}

export const at = (m: number, d: number, h = 12, y = 2026) => istToISO(y, m, d, h, 0);
