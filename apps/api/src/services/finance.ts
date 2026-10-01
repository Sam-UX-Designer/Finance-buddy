import {
  applyEnginePasses,
  classify,
  detectRecurring,
  isDepositAccount,
  type FinancialState,
  type Txn,
} from '@moneymate/core';
import { nowISO, type AppContext } from '../context';
import { linkedAccounts, listAccounts, toEngineAccount } from '../repo/accounts';
import { listBudgets, listGoals, loadAssumptions, loadHoldings, navLookup } from '../repo/misc';
import { loadTxns, loadUserRules, saveClassifications } from '../repo/txns';
import { bumpDataVersion, getUser, userName } from '../repo/users';

/**
 * Re-runs classification for every transaction: rules (+ the user's learned rules) → engine passes
 * (own transfers, loans) → recurring flags. User-sourced fields are never overwritten.
 */
export function recompute(ctx: AppContext, userId: string): void {
  const accounts = listAccounts(ctx, userId);
  const engineAccounts = accounts.map(toEngineAccount);
  const rules = loadUserRules(ctx, userId);
  const user = getUser(ctx, userId);
  const name = user ? userName(ctx, user) : null;
  const cls = {
    ownAccountLast4: accounts.map((a) => a.masked_number.slice(-4)),
    ownNames: name ? [name.toLowerCase()] : [],
    userRules: rules,
  };
  const original = loadTxns(ctx, userId);
  const reclassified: Txn[] = original.map((t) => {
    const c = classify({ direction: t.direction, narration: t.narration, mode: t.mode, amount: t.amount }, cls);
    return {
      ...t,
      merchantKey: c.merchantKey,
      merchantName: c.merchantName,
      counterparty: c.counterparty,
      type: t.typeSource === 'USER' ? t.type : c.type,
      categoryId: t.categorySource === 'USER' ? t.categoryId : c.categoryId,
      confidence: t.typeSource === 'USER' && t.categorySource === 'USER' ? 1 : c.confidence,
      typeSource: t.typeSource === 'USER' ? 'USER' : 'RULE',
      categorySource: t.categorySource === 'USER' ? 'USER' : 'RULE',
    };
  });
  const passed = applyEnginePasses(reclassified, engineAccounts);

  // Recurring flags from detection (user marks win).
  const depositIds = new Set(accounts.filter((a) => isDepositAccount(a.type)).map((a) => a.id));
  const detected = detectRecurring(passed.filter((t) => depositIds.has(t.accountId)), nowISO(ctx));
  const recurringIds = new Set(detected.filter((s) => s.source === 'DETECTED').flatMap((s) => s.txnIds));
  for (const t of passed) {
    if (t.recurringSource === 'USER') continue;
    const isRec = recurringIds.has(t.id);
    t.isRecurring = isRec;
    t.recurringSource = isRec ? 'ENGINE' : null;
  }

  const byId = new Map(original.map((t) => [t.id, t]));
  const changed = passed.filter((t) => {
    const o = byId.get(t.id)!;
    return (
      o.type !== t.type ||
      o.categoryId !== t.categoryId ||
      o.confidence !== t.confidence ||
      o.typeSource !== t.typeSource ||
      o.categorySource !== t.categorySource ||
      o.merchantKey !== t.merchantKey ||
      o.merchantName !== t.merchantName ||
      (o.counterparty ?? null) !== (t.counterparty ?? null) ||
      o.isRecurring !== t.isRecurring ||
      (o.recurringSource ?? null) !== (t.recurringSource ?? null)
    );
  });
  if (changed.length) saveClassifications(ctx, changed);
  bumpDataVersion(ctx, userId);
}

const cache = new Map<string, { version: number; at: number; state: FinancialState }>();
const CACHE_MS = 60_000;

/** Everything the Finance Engine needs for one user, from the data store. Cached per data version. */
export function financialState(ctx: AppContext, userId: string): FinancialState {
  const user = getUser(ctx, userId);
  if (!user) throw new Error('User not found');
  const now = nowISO(ctx);
  const hit = cache.get(userId);
  if (hit && hit.version === user.data_version && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.state, now };
  }
  const accounts = linkedAccounts(ctx, userId);
  const linkedIds = new Set(accounts.map((a) => a.id));
  const txns = loadTxns(ctx, userId, [...linkedIds]);
  const holdings = loadHoldings(ctx, userId, linkedIds);
  const schemeCodes = [...new Set(holdings.mutualFunds.map((h) => h.schemeCode))];
  const state: FinancialState = {
    now,
    user: { id: userId, name: userName(ctx, user) },
    accounts: accounts.map(toEngineAccount),
    txns,
    holdings,
    goals: listGoals(ctx, userId),
    budgets: listBudgets(ctx, userId),
    assumptionOverrides: loadAssumptions(ctx, userId),
    navLookup: navLookup(ctx, schemeCodes),
    partial: accounts.some((a) => a.sync_status === 'FAILED'),
  };
  cache.set(userId, { version: user.data_version, at: Date.now(), state });
  return state;
}

export function invalidate(userId: string): void {
  cache.delete(userId);
}
