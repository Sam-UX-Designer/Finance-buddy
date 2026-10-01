import {
  budgetStatuses,
  cashForecast,
  category,
  depositAccounts,
  forecastContext,
  formatMonthKey,
  greetingFor,
  istDateKey,
  istMonthKey,
  monthEndISO,
  monthSummary,
  netWorth,
  netWorthChangeThisYear,
  netWorthTrend,
  nextSalaryDate,
  projectGoal,
  projectNetWorth,
  receivables,
  SPEND_CATEGORY_IDS,
  topInsight,
  totalCash,
  TXN_TYPE_LABELS,
  upcomingPayments,
  type ActivityFilter,
  type BudgetsResponse,
  type CategoryId,
  type ForecastDTO,
  type HoldingDTO,
  type HomeDTO,
  type PlanDTO,
  type Txn,
  type TxnDTO,
  type TxnListResponse,
  type UpcomingPayment,
  type WealthDTO,
} from '@finance-buddy/core';
import type { AppContext } from '../context';
import { ACCOUNT_TYPE_LABELS, fip } from '../aa/fips';
import { listAccounts, type AccountRow } from '../repo/accounts';
import { latestJob } from '../repo/jobs';
import { unreadCount } from '../repo/misc';
import { financialState } from './finance';

export async function homeDTO(ctx: AppContext, userId: string): Promise<HomeDTO> {
  const state = await financialState(ctx, userId);
  const fctx = forecastContext(state);
  const deposits = depositAccounts(state.accounts);
  const month = monthSummary(state);
  const upcoming = upcomingPayments(fctx.recurring, state.now, 30);
  const hasWealth = state.accounts.length > 0;
  const nw = hasWealth ? netWorth(state) : null;
  const change = hasWealth ? netWorthChangeThisYear(state) : null;
  const job = await latestJob(ctx, userId, 'SYNC');
  const rows = (await listAccounts(ctx, userId)).filter((a) => a.linked === 1);
  const lastSyncedAt = rows.reduce<string | null>((m, a) => (a.last_synced_at && (!m || a.last_synced_at > m) ? a.last_synced_at : m), null);
  let health: HomeDTO['sync']['health'] = 'OK';
  let message: string | null = null;
  if (rows.length === 0) {
    health = 'NO_DATA';
    message = 'No accounts connected yet.';
  } else if (job?.status === 'RUNNING') {
    health = 'SYNCING';
    message = 'Updating your accounts…';
  } else if (job?.status === 'FAILED') {
    health = 'FAILED';
    message = 'The last update failed. Your numbers may be out of date.';
  } else if (state.partial) {
    health = 'PARTIAL';
    message = 'Some accounts could not be updated, so this picture is incomplete.';
  }
  const firstName = state.user.name?.split(' ')[0] ?? null;
  const accountMap = new Map(rows.map((a) => [a.id, a]));
  const todayKey = istDateKey(state.now);
  const spends = state.txns
    .filter((t) => t.type === 'EXPENSE' && t.direction === 'DEBIT')
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt) || b.id.localeCompare(a.id));
  const spentToday = spends.filter((t) => istDateKey(t.postedAt) === todayKey);
  const invLines = (nw?.lines ?? []).filter((l) => l.kind === 'MUTUAL_FUNDS' || l.kind === 'TERM_DEPOSIT' || l.kind === 'EPF');
  const invValue = invLines.reduce((s, l) => s + l.value, 0);
  const invInvested = invLines.reduce((s, l) => s + (l.invested ?? l.value), 0);
  return {
    greeting: greetingFor(state.now),
    name: firstName,
    balance: {
      total: totalCash(state.accounts),
      accountCount: deposits.length,
      asOf: deposits.reduce<string | null>((m, a) => (!m || a.balanceAsOf > m ? a.balanceAsOf : m), null),
      accounts: rows
        .filter((r) => r.type === 'SAVINGS' || r.type === 'CURRENT')
        .map((r) => ({
          id: r.id,
          fip: fip(r.fip_id),
          typeLabel: ACCOUNT_TYPE_LABELS[r.type],
          maskedNumber: r.masked_number,
          balance: r.current_balance,
          balanceAsOf: r.balance_as_of,
          lastSyncedAt: r.last_synced_at,
        })),
    },
    month: {
      key: istMonthKey(state.now),
      label: formatMonthKey(istMonthKey(state.now)),
      income: month.income,
      spent: month.spent,
      invested: month.investments,
      savingsRatePct: month.savingsRatePct,
    },
    insight: topInsight(state, fctx),
    upcoming: { count: upcoming.length, total: upcoming.reduce((s, u) => s + u.amount, 0), days: 30, items: upcoming.slice(0, 5) },
    wealth:
      nw && change
        ? {
            netWorth: nw.netWorth,
            assets: nw.assets,
            liabilities: nw.liabilities,
            parts: nw.lines
              .filter((l) => l.value > 0)
              .sort((a, b) => b.value - a.value)
              .map((l) => ({ kind: l.kind, label: l.kind === 'SAVINGS' ? 'Bank balance' : l.label, value: l.value })),
            change: change.change,
            changePct: change.changePct,
            sinceDate: change.sinceDate,
          }
        : null,
    today: {
      spent: spentToday.reduce((s, t) => s + t.amount, 0),
      count: spentToday.length,
      recent: spends.slice(0, 3).map((t) => toTxnDTO(t, accountMap)),
    },
    investments: invLines.length
      ? {
          value: invValue,
          invested: invInvested,
          gain: invValue - invInvested,
          gainPct: invInvested > 0 ? Math.round(((invValue - invInvested) / invInvested) * 1000) / 10 : null,
          lines: invLines.map((l) => ({ kind: l.kind, label: l.label, value: l.value, gain: l.gain, gainPct: l.gainPct })),
        }
      : null,
    sync: { health, lastSyncedAt, message },
    unreadNotifications: await unreadCount(ctx, userId),
  };
}

export async function upcomingDTO(ctx: AppContext, userId: string, days = 30): Promise<{ days: number; total: number; items: UpcomingPayment[] }> {
  const state = await financialState(ctx, userId);
  const items = upcomingPayments(forecastContext(state).recurring, state.now, days);
  return { days, total: items.reduce((s, u) => s + u.amount, 0), items };
}

// ── Activity ─────────────────────────────────────────────────────────
export function toTxnDTO(t: Txn & { reference?: string | null }, accounts: Map<string, AccountRow>): TxnDTO {
  const a = accounts.get(t.accountId);
  const cat = category(t.categoryId);
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: a ? fip(a.fip_id).shortName : 'Account',
    accountMask: a ? a.masked_number.slice(-4) : '',
    fip: fip(a?.fip_id ?? 'unknown'),
    postedAt: t.postedAt,
    amount: t.amount,
    direction: t.direction,
    mode: t.mode,
    merchantName: t.merchantName,
    merchantKey: t.merchantKey,
    counterparty: t.counterparty ?? null,
    categoryId: t.categoryId,
    categoryName: cat.name,
    emoji: cat.emoji,
    type: t.type,
    typeLabel: TXN_TYPE_LABELS[t.type],
    confidence: t.confidence,
    typeSource: t.typeSource,
    categorySource: t.categorySource,
    isRecurring: t.isRecurring,
    note: t.note ?? null,
    splits: t.splits ?? null,
    narration: t.narration,
    reference: t.reference ?? null,
  };
}

const FILTER_TYPES: Record<Exclude<ActivityFilter, 'all'>, string[]> = {
  expenses: ['EXPENSE', 'REFUND'],
  income: ['INCOME'],
  investments: ['INVESTMENT'],
  loans: ['LOAN_GIVEN', 'LOAN_REPAID'],
  transfers: ['TRANSFER'],
};

export interface ActivityQuery {
  filter?: ActivityFilter;
  q?: string;
  categoryId?: CategoryId;
  accountId?: string;
  month?: string;
  merchantKey?: string;
  cursor?: string;
  limit?: number;
}

export async function activityDTO(ctx: AppContext, userId: string, query: ActivityQuery): Promise<TxnListResponse> {
  const state = await financialState(ctx, userId);
  const accounts = new Map((await listAccounts(ctx, userId)).map((a) => [a.id, a]));
  let txns = [...state.txns].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt) || b.id.localeCompare(a.id));
  if (query.filter && query.filter !== 'all') {
    const types = FILTER_TYPES[query.filter];
    txns = txns.filter((t) => types.includes(t.type) || (t.splits ?? []).some((s) => types.includes(s.type)));
  }
  if (query.categoryId) txns = txns.filter((t) => t.categoryId === query.categoryId || (t.splits ?? []).some((s) => s.categoryId === query.categoryId));
  if (query.accountId) txns = txns.filter((t) => t.accountId === query.accountId);
  if (query.merchantKey) txns = txns.filter((t) => t.merchantKey === query.merchantKey);
  if (query.month) txns = txns.filter((t) => istMonthKey(t.postedAt) === query.month);
  if (query.q?.trim()) {
    const q = query.q.trim().toLowerCase();
    const digits = q.replace(/[₹,\s]/g, '');
    txns = txns.filter((t) =>
      t.merchantName.toLowerCase().includes(q) ||
      category(t.categoryId).name.toLowerCase().includes(q) ||
      t.narration.toLowerCase().includes(q) ||
      (t.note ?? '').toLowerCase().includes(q) ||
      (/^\d+(\.\d+)?$/.test(digits) && String(t.amount / 100).startsWith(digits)),
    );
  }
  const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
  const offset = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString()) || 0 : 0;
  const page = txns.slice(offset, offset + limit);
  const next = offset + limit < txns.length ? Buffer.from(String(offset + limit)).toString('base64url') : null;
  return { items: page.map((t) => toTxnDTO(t, accounts)), nextCursor: next, total: txns.length };
}

// ── Wealth ───────────────────────────────────────────────────────────
export async function wealthDTO(ctx: AppContext, userId: string): Promise<WealthDTO> {
  const state = await financialState(ctx, userId);
  const nw = netWorth(state);
  const holdings: HoldingDTO[] = [];
  for (const h of state.holdings.mutualFunds) {
    holdings.push({
      id: `mf:${h.schemeCode}`,
      kind: 'MUTUAL_FUND',
      name: h.schemeName,
      subtitle: `${h.units.toFixed(2)} units`,
      value: h.currentValue,
      invested: h.investedAmount,
      gain: h.currentValue - h.investedAmount,
      gainPct: h.investedAmount ? Math.round(((h.currentValue - h.investedAmount) / h.investedAmount) * 1000) / 10 : null,
      group: 'INVESTMENTS',
    });
  }
  const byId = new Map(state.accounts.map((a) => [a.id, a]));
  for (const fd of state.holdings.termDeposits) {
    const a = byId.get(fd.accountId);
    holdings.push({
      id: `fd:${fd.accountId}`,
      kind: 'TERM_DEPOSIT',
      name: `${a ? fip(a.fipId).shortName : 'Bank'} Fixed Deposit`,
      subtitle: `${fd.ratePct}% · matures ${fd.maturesAt.slice(0, 10)}`,
      value: fd.currentValue,
      invested: fd.principal,
      gain: fd.currentValue - fd.principal,
      gainPct: Math.round(((fd.currentValue - fd.principal) / fd.principal) * 1000) / 10,
      group: 'BANK',
    });
  }
  for (const a of depositAccounts(state.accounts)) {
    holdings.push({ id: `acc:${a.id}`, kind: 'SAVINGS', name: a.displayName, subtitle: `•••• ${a.maskedNumber.slice(-4)}`, value: a.currentBalance, invested: null, gain: null, gainPct: null, group: 'BANK' });
  }
  for (const e of state.holdings.epf) {
    const contributions = e.entries.filter((x) => x.kind === 'CONTRIBUTION').reduce((s, x) => s + x.amount, 0);
    holdings.push({ id: `epf:${e.accountId}`, kind: 'EPF', name: 'Employees’ Provident Fund', subtitle: 'Contributions + interest', value: e.balance, invested: contributions, gain: e.balance - contributions, gainPct: contributions ? Math.round(((e.balance - contributions) / contributions) * 1000) / 10 : null, group: 'OTHER' });
  }
  const owed = receivables(state.txns).filter((r) => r.outstanding > 0);
  for (const r of owed) {
    holdings.push({ id: `rcv:${r.merchantKey}`, kind: 'RECEIVABLE', name: r.counterparty, subtitle: 'Owes you', value: r.outstanding, invested: null, gain: null, gainPct: null, group: 'OTHER' });
  }
  return {
    netWorth: nw.netWorth,
    assets: nw.assets,
    liabilities: nw.liabilities,
    change: netWorthChangeThisYear(state),
    trend: netWorthTrend(state).map((p) => ({ date: p.date, value: p.value })),
    lines: nw.lines,
    allocation: nw.allocation,
    holdings,
    receivables: owed,
    partial: state.partial,
  };
}

// ── Plan ─────────────────────────────────────────────────────────────
export async function planDTO(ctx: AppContext, userId: string): Promise<PlanDTO> {
  const state = await financialState(ctx, userId);
  const fctx = forecastContext(state);
  return {
    goals: state.goals.map((g) => ({ ...g, projection: projectGoal(g, state.now, fctx.assumptions.goalReturnPct) })),
    projection: projectNetWorth(state, fctx),
    assumptions: fctx.assumptionInfo,
    salaryFrom: fctx.salary?.payer ?? null,
  };
}

export async function forecastDTO(ctx: AppContext, userId: string): Promise<ForecastDTO> {
  const state = await financialState(ctx, userId);
  const fctx = forecastContext(state);
  const next = nextSalaryDate(fctx);
  return {
    nextSalaryDate: next,
    endOfMonth: cashForecast(fctx, new Date(Date.parse(monthEndISO(istMonthKey(state.now))) - 1).toISOString()),
    untilNextSalary: next ? cashForecast(fctx, new Date(Date.parse(next) - 60_000).toISOString()) : null,
    assumptions: fctx.assumptionInfo,
    safetyBuffer: fctx.assumptions.safetyBuffer,
  };
}

export async function budgetsDTO(ctx: AppContext, userId: string): Promise<BudgetsResponse> {
  const state = await financialState(ctx, userId);
  const month = monthSummary(state);
  const statuses = budgetStatuses(state.budgets, month, state.now);
  const budgeted = new Set(state.budgets.map((b) => b.categoryId));
  return {
    monthKey: istMonthKey(state.now),
    budgets: statuses.map((s) => ({ ...s, categoryName: category(s.categoryId).name, emoji: category(s.categoryId).emoji })),
    unbudgeted: SPEND_CATEGORY_IDS.filter((id) => !budgeted.has(id))
      .map((id) => ({ categoryId: id, categoryName: category(id).name, emoji: category(id).emoji, spent: month.byCategory.find((c) => c.categoryId === id)?.spent ?? 0 }))
      .sort((a, b) => b.spent - a.spent),
  };
}
