import { classify, type ClassificationContext, type EPFAccount, type MFHolding, type PaymentMode, type TermDeposit } from '@moneymate/core';
import { sha256 } from '../lib/crypto';
import type { DepositPayload, EPFPayload, MutualFundPayload, TermDepositPayload } from '../aa/provider';
import type { NewTxn } from '../repo/txns';

const MODES: PaymentMode[] = ['UPI', 'CARD', 'NEFT', 'IMPS', 'RTGS', 'ATM', 'ACH', 'CHEQUE', 'INTEREST', 'OTHERS'];

export class IngestError extends Error {}

/** "1234.50" → 123450 paise. Rejects anything that is not a plain non-negative decimal. */
export function toPaise(value: string, field: string): number {
  if (!/^-?\d+(\.\d{1,4})?$/.test(value.trim())) throw new IngestError(`Invalid amount in ${field}: ${value}`);
  return Math.round(Number(value) * 100);
}

function validTimestamp(value: string, field: string): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) throw new IngestError(`Invalid timestamp in ${field}: ${value}`);
  return new Date(t).toISOString();
}

export interface NormalizedDeposit {
  currentBalance: number;
  balanceAsOf: string;
  holderName: string;
  txns: NewTxn[];
  rejected: number;
}

/**
 * Validates and normalises a deposit statement. Malformed rows are counted and skipped instead of
 * failing the whole account, and duplicates are removed by a stable key.
 */
export function normalizeDeposit(payload: DepositPayload, accountId: string, cls: ClassificationContext): NormalizedDeposit {
  const seen = new Set<string>();
  const txns: NewTxn[] = [];
  let rejected = 0;
  for (const [index, t] of payload.transactions.entries()) {
    try {
      const amount = toPaise(t.amount, 'amount');
      if (amount <= 0) throw new IngestError('Non-positive amount');
      if (t.type !== 'DEBIT' && t.type !== 'CREDIT') throw new IngestError('Invalid type');
      const postedAt = validTimestamp(t.transactionTimestamp, 'transactionTimestamp');
      const mode = MODES.includes(t.mode) ? t.mode : 'OTHERS';
      const dedupeKey = t.txnId
        ? sha256(`${accountId}|${t.txnId}`)
        : sha256(`${accountId}|${postedAt}|${amount}|${t.type}|${t.narration}`);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const c = classify({ direction: t.type, narration: t.narration, mode, amount }, cls);
      txns.push({
        accountId,
        dedupeKey,
        postedAt,
        amount,
        direction: t.type,
        mode: c.mode === 'OTHERS' ? mode : c.mode,
        narration: t.narration.slice(0, 500),
        reference: t.reference || null,
        merchantKey: c.merchantKey,
        merchantName: c.merchantName,
        counterparty: c.counterparty,
        categoryId: c.categoryId,
        type: c.type,
        confidence: c.confidence,
        balanceAfter: t.currentBalance ? toPaise(t.currentBalance, 'currentBalance') : null,
        // Statement order breaks ties between transactions that share a timestamp.
        seq: index,
      });
    } catch (e) {
      if (e instanceof IngestError) rejected += 1;
      else throw e;
    }
  }
  return {
    currentBalance: toPaise(payload.currentBalance, 'currentBalance'),
    balanceAsOf: validTimestamp(payload.balanceDateTime, 'balanceDateTime'),
    holderName: payload.holderName,
    txns,
    rejected,
  };
}

export function normalizeMutualFunds(payload: MutualFundPayload, accountId: string): { holdings: MFHolding[]; value: number } {
  const holdings: MFHolding[] = payload.holdings.map((h) => {
    const units = Number(h.units);
    const nav = Number(h.nav);
    if (!Number.isFinite(units) || !Number.isFinite(nav)) throw new IngestError('Invalid holding');
    return {
      accountId,
      schemeCode: h.schemeCode,
      schemeName: h.schemeName,
      units,
      nav,
      navDate: validTimestamp(h.navDate, 'navDate'),
      investedAmount: toPaise(h.investedAmount, 'investedAmount'),
      currentValue: Math.round(units * nav * 100),
      transactions: payload.transactions
        .filter((t) => t.schemeCode === h.schemeCode)
        .map((t) => ({ date: validTimestamp(t.date, 'date'), units: Number(t.units), nav: Number(t.nav), amount: toPaise(t.amount, 'amount') })),
    };
  });
  return { holdings, value: holdings.reduce((s, h) => s + h.currentValue, 0) };
}

export function normalizeTermDeposit(payload: TermDepositPayload, accountId: string): TermDeposit {
  return {
    accountId,
    principal: toPaise(payload.principalAmount, 'principalAmount'),
    ratePct: Number(payload.interestRate),
    openedAt: validTimestamp(payload.openingDate, 'openingDate'),
    maturesAt: validTimestamp(payload.maturityDate, 'maturityDate'),
    compoundingPerYear: payload.compoundingFrequency === 'MONTHLY' ? 12 : payload.compoundingFrequency === 'YEARLY' ? 1 : 4,
    currentValue: toPaise(payload.currentValue, 'currentValue'),
  };
}

export function normalizeEPF(payload: EPFPayload, accountId: string): EPFAccount {
  return {
    accountId,
    balance: toPaise(payload.balance, 'balance'),
    entries: payload.entries.map((e) => ({ date: validTimestamp(e.date, 'date'), amount: toPaise(e.amount, 'amount'), kind: e.kind })),
  };
}
