import { DAY_MS } from './dates';
import type { Paise } from './money';
import type { Account, Txn } from './types';

const TRANSFER_WINDOW_MS = 3 * DAY_MS;
const LOAN_PAIR_WINDOW_MS = 90 * DAY_MS;

/**
 * Engine pass that runs after rule classification:
 *  1. Detects transfers between the user's own connected accounts (both legs → TRANSFER).
 *  2. Tracks money lent per person and marks matching credits as LOAN_REPAID.
 *  3. Infers a loan when a payment to a person is later returned in full by the same person.
 * User corrections (typeSource USER) are never overridden.
 */
export function applyEnginePasses(txns: readonly Txn[], accounts: readonly Account[]): Txn[] {
  const out = txns.map((t) => ({ ...t }));
  pairOwnTransfers(out, accounts);
  pairLoans(out);
  return out;
}

function pairOwnTransfers(txns: Txn[], accounts: readonly Account[]): void {
  const deposit = new Set(accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'CURRENT').map((a) => a.id));
  const last4 = new Map(accounts.map((a) => [a.id, a.maskedNumber.slice(-4)]));
  const sorted = [...txns].sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  const used = new Set<string>();
  for (const debit of sorted) {
    if (debit.direction !== 'DEBIT' || used.has(debit.id) || !deposit.has(debit.accountId)) continue;
    if (debit.typeSource === 'USER' && debit.type !== 'TRANSFER') continue;
    const tDebit = Date.parse(debit.postedAt);
    const credit = sorted.find(
      (c) =>
        c.direction === 'CREDIT' &&
        !used.has(c.id) &&
        c.accountId !== debit.accountId &&
        deposit.has(c.accountId) &&
        c.amount === debit.amount &&
        Math.abs(Date.parse(c.postedAt) - tDebit) <= TRANSFER_WINDOW_MS &&
        !(c.typeSource === 'USER' && c.type !== 'TRANSFER'),
    );
    if (!credit) continue;
    const mentionsOther =
      debit.narration.includes(`X${last4.get(credit.accountId)}`) ||
      credit.narration.includes(`X${last4.get(debit.accountId)}`);
    const bothFlagged = debit.type === 'TRANSFER' || credit.type === 'TRANSFER';
    if (!mentionsOther && !bothFlagged) continue;
    used.add(debit.id);
    used.add(credit.id);
    for (const t of [debit, credit]) {
      if (t.typeSource === 'USER') continue;
      t.type = 'TRANSFER';
      t.categoryId = 'transfers';
      t.confidence = mentionsOther ? 0.95 : 0.85;
      t.typeSource = 'ENGINE';
      if (t.categorySource !== 'USER') t.categorySource = 'ENGINE';
    }
  }
}

function pairLoans(txns: Txn[]): void {
  const byPerson = new Map<string, Txn[]>();
  for (const t of txns) {
    if (!t.counterparty || t.splits?.length) continue;
    const list = byPerson.get(t.merchantKey) ?? [];
    list.push(t);
    byPerson.set(t.merchantKey, list);
  }
  for (const list of byPerson.values()) {
    list.sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
    // Outstanding loan amounts with when they were given.
    const open: { txn: Txn; outstanding: Paise }[] = [];
    for (const t of list) {
      if (t.direction === 'DEBIT') {
        if (t.type === 'LOAN_GIVEN') open.push({ txn: t, outstanding: t.amount });
        else if (t.type === 'EXPENSE' && t.typeSource !== 'USER' && t.categoryId === 'people') {
          // Candidate: may turn out to be a loan if the same person returns it.
          open.push({ txn: t, outstanding: t.amount });
        }
        continue;
      }
      // Credit from this person.
      if (t.typeSource === 'USER' && t.type !== 'LOAN_REPAID') continue;
      const tCredit = Date.parse(t.postedAt);
      const lent = open.filter((o) => o.outstanding > 0 && o.txn.type === 'LOAN_GIVEN');
      const totalLent = lent.reduce((s, o) => s + o.outstanding, 0);
      if (totalLent > 0 && t.amount <= totalLent) {
        markRepaid(t, 0.85);
        let remaining = t.amount;
        for (const o of lent) {
          const take = Math.min(o.outstanding, remaining);
          o.outstanding -= take;
          remaining -= take;
          if (remaining === 0) break;
        }
        continue;
      }
      // Inference: a recent "people" payment returned in full by the same person.
      const candidate = open.find(
        (o) =>
          o.txn.type === 'EXPENSE' &&
          o.outstanding === t.amount &&
          tCredit - Date.parse(o.txn.postedAt) <= LOAN_PAIR_WINDOW_MS &&
          tCredit > Date.parse(o.txn.postedAt),
      );
      if (candidate) {
        candidate.txn.type = 'LOAN_GIVEN';
        candidate.txn.categoryId = 'loans';
        candidate.txn.confidence = 0.7;
        candidate.txn.typeSource = 'ENGINE';
        if (candidate.txn.categorySource !== 'USER') candidate.txn.categorySource = 'ENGINE';
        candidate.outstanding = 0;
        markRepaid(t, 0.7);
      }
    }
  }
}

function markRepaid(t: Txn, confidence: number): void {
  if (t.typeSource === 'USER') return;
  t.type = 'LOAN_REPAID';
  t.categoryId = 'loans';
  t.confidence = confidence;
  t.typeSource = 'ENGINE';
  if (t.categorySource !== 'USER') t.categorySource = 'ENGINE';
}

export interface Receivable {
  counterparty: string;
  merchantKey: string;
  lent: Paise;
  repaid: Paise;
  outstanding: Paise;
  lastLentAt: string | null;
  lastRepaidAt: string | null;
}

/** Money lent and still owed to the user, per person (includes split-transaction shares). */
export function receivables(txns: readonly Txn[], asOfISO?: string): Receivable[] {
  const cutoff = asOfISO ? Date.parse(asOfISO) : Infinity;
  const map = new Map<string, Receivable>();
  const get = (key: string, name: string) => {
    let r = map.get(key);
    if (!r) {
      r = { counterparty: name, merchantKey: key, lent: 0, repaid: 0, outstanding: 0, lastLentAt: null, lastRepaidAt: null };
      map.set(key, r);
    }
    return r;
  };
  for (const t of txns) {
    if (Date.parse(t.postedAt) > cutoff) continue;
    const parts = t.splits?.length
      ? t.splits.map((s) => ({ type: s.type, amount: s.amount, who: s.counterparty || t.counterparty || 'Others' }))
      : [{ type: t.type, amount: t.amount, who: t.counterparty || t.merchantName }];
    for (const p of parts) {
      const key = p.who === t.merchantName ? t.merchantKey : `person:${p.who.toLowerCase()}`;
      if (p.type === 'LOAN_GIVEN' && t.direction === 'DEBIT') {
        const r = get(key, p.who);
        r.lent += p.amount;
        r.lastLentAt = t.postedAt;
      } else if (p.type === 'LOAN_REPAID' && t.direction === 'CREDIT') {
        const r = get(key, p.who);
        r.repaid += p.amount;
        r.lastRepaidAt = t.postedAt;
      }
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, outstanding: Math.max(0, r.lent - r.repaid) }))
    .sort((a, b) => b.outstanding - a.outstanding);
}
