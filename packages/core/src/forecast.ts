import { totalCash } from './balances';
import { addMonthsISO, DAY_MS, istDateKey, istMonthKey, istParts, istToISO, monthEndISO, monthStartISO } from './dates';
import { inRange, totalsOf } from './ledger';
import type { Paise } from './money';
import { pctChange } from './money';
import { detectRecurring, monthlyEquivalent, upcomingPayments, type RecurringSeries, type UpcomingPayment } from './recurring';
import { detectSalary, type SalaryInfo } from './salary';
import { cashLedger, completeMonthsWithData } from './summary';
import { fdValueAt, netWorth } from './wealth';
import type { FinancialState, ForecastAssumptions } from './types';

export interface AssumptionInfo {
  key: keyof ForecastAssumptions;
  label: string;
  value: number;
  unit: 'paise' | 'pct';
  source: 'HISTORY' | 'DEFAULT' | 'USER';
  explanation: string;
}

export interface ForecastContext {
  now: string;
  cash: Paise;
  salary: SalaryInfo | null;
  recurring: RecurringSeries[];
  assumptions: ForecastAssumptions;
  assumptionInfo: AssumptionInfo[];
  /** Months of history used to derive defaults. */
  historyMonths: string[];
}

const DEFAULTS = {
  safetyBufferMin: 500000, // ₹5,000
  mfReturnPct: 10,
  epfRatePct: 8.25,
  savingsRatePct: 0,
  goalReturnPct: 0,
};

/** Average monthly spend that is NOT part of a recurring series, over the last 3 complete months. */
function variableSpendHistory(state: FinancialState, recurring: RecurringSeries[], months: string[]): Paise | null {
  if (months.length === 0) return null;
  const recurringIds = new Set(recurring.filter((s) => s.type === 'EXPENSE').flatMap((s) => s.txnIds));
  const entries = cashLedger(state).filter((e) => !recurringIds.has(e.txnId));
  const last = months.slice(-3);
  const spent = last.map((m) => totalsOf(inRange(entries, monthStartISO(m), monthEndISO(m))).spent);
  return Math.round(spent.reduce((s, v) => s + v, 0) / spent.length);
}

function incomeHistory(state: FinancialState, months: string[]): Paise | null {
  if (months.length === 0) return null;
  const entries = cashLedger(state);
  const last = months.slice(-3);
  const income = last.map((m) => totalsOf(inRange(entries, monthStartISO(m), monthEndISO(m))).income);
  return Math.round(income.reduce((s, v) => s + v, 0) / income.length);
}

export function monthlyRecurringOutflow(recurring: readonly RecurringSeries[], type: 'EXPENSE' | 'INVESTMENT'): Paise {
  return recurring.filter((s) => s.type === type).reduce((s, r) => s + monthlyEquivalent(r), 0);
}

/** Builds forecast inputs. Every default is derived from history and can be overridden by the user. */
export function forecastContext(state: FinancialState): ForecastContext {
  const cash = totalCash(state.accounts);
  const depositIds = new Set(state.accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'CURRENT').map((a) => a.id));
  const cashTxns = state.txns.filter((t) => depositIds.has(t.accountId));
  const salary = detectSalary(cashTxns);
  const recurring = detectRecurring(cashTxns, state.now);
  const months = completeMonthsWithData(cashTxns, state.now);
  const o = state.assumptionOverrides;

  const histIncome = salary?.amount ?? incomeHistory(state, months);
  const histVariable = variableSpendHistory(state, recurring, months);
  const recurringExpense = monthlyRecurringOutflow(recurring, 'EXPENSE');
  const defaultBuffer = Math.max(
    DEFAULTS.safetyBufferMin,
    Math.ceil((((histVariable ?? 0) + recurringExpense) * 0.25) / 100000) * 100000,
  );

  const assumptions: ForecastAssumptions = {
    monthlyIncome: o.monthlyIncome ?? histIncome ?? 0,
    monthlyVariableSpend: o.monthlyVariableSpend ?? histVariable ?? 0,
    safetyBuffer: o.safetyBuffer ?? defaultBuffer,
    mfReturnPct: o.mfReturnPct ?? DEFAULTS.mfReturnPct,
    epfRatePct: o.epfRatePct ?? DEFAULTS.epfRatePct,
    savingsRatePct: o.savingsRatePct ?? DEFAULTS.savingsRatePct,
    goalReturnPct: o.goalReturnPct ?? DEFAULTS.goalReturnPct,
  };
  const src = (key: keyof ForecastAssumptions, fromHistory: boolean): AssumptionInfo['source'] =>
    o[key] !== undefined ? 'USER' : fromHistory ? 'HISTORY' : 'DEFAULT';

  const assumptionInfo: AssumptionInfo[] = [
    {
      key: 'monthlyIncome',
      label: 'Monthly income',
      value: assumptions.monthlyIncome,
      unit: 'paise',
      source: src('monthlyIncome', histIncome != null),
      explanation: salary ? `Your salary from ${salary.payer} (typical of the last 3 credits).` : 'Average income over your recent complete months.',
    },
    {
      key: 'monthlyVariableSpend',
      label: 'Everyday spending per month',
      value: assumptions.monthlyVariableSpend,
      unit: 'paise',
      source: src('monthlyVariableSpend', histVariable != null),
      explanation: 'Average of your last 3 complete months, excluding recurring bills and SIPs (those are counted on their due dates).',
    },
    {
      key: 'safetyBuffer',
      label: 'Safety buffer',
      value: assumptions.safetyBuffer,
      unit: 'paise',
      source: src('safetyBuffer', false),
      explanation: 'Money kept aside for surprises. Not counted as available to spend or invest.',
    },
    {
      key: 'mfReturnPct',
      label: 'Mutual fund return (yearly)',
      value: assumptions.mfReturnPct,
      unit: 'pct',
      source: src('mfReturnPct', false),
      explanation: 'An assumption, not a promise. Markets go up and down.',
    },
    {
      key: 'epfRatePct',
      label: 'EPF interest (yearly)',
      value: assumptions.epfRatePct,
      unit: 'pct',
      source: src('epfRatePct', false),
      explanation: 'Change this if the declared EPF rate is different.',
    },
    {
      key: 'savingsRatePct',
      label: 'Savings account interest (yearly)',
      value: assumptions.savingsRatePct,
      unit: 'pct',
      source: src('savingsRatePct', false),
      explanation: 'Kept at 0% by default to stay conservative.',
    },
    {
      key: 'goalReturnPct',
      label: 'Return on goal savings (yearly)',
      value: assumptions.goalReturnPct,
      unit: 'pct',
      source: src('goalReturnPct', false),
      explanation: 'Use 0% if you keep goal money in a savings account.',
    },
  ];
  return { now: state.now, cash, salary, recurring, assumptions, assumptionInfo, historyMonths: months };
}

/** Next salary date strictly after now, or null without a detected salary. */
export function nextSalaryDate(ctx: Pick<ForecastContext, 'salary' | 'now'>): string | null {
  if (!ctx.salary) return null;
  let next = ctx.salary.nextExpectedAt;
  let guard = 0;
  while (Date.parse(next) <= Date.parse(ctx.now) && guard++ < 24) next = addMonthsISO(next, 1);
  return next;
}

function salaryDatesBetween(ctx: ForecastContext, fromISO: string, toISO: string): string[] {
  const first = nextSalaryDate(ctx);
  if (!first) return [];
  const out: string[] = [];
  let d = first;
  let guard = 0;
  while (Date.parse(d) <= Date.parse(toISO) && guard++ < 120) {
    if (Date.parse(d) > Date.parse(fromISO)) out.push(d);
    d = addMonthsISO(d, 1);
  }
  return out;
}

export interface CashForecastPoint {
  date: string;
  balance: Paise;
}

export interface CashForecast {
  start: Paise;
  end: Paise;
  until: string;
  points: CashForecastPoint[];
  lowest: CashForecastPoint;
  income: Paise;
  obligations: Paise;
  variableSpend: Paise;
  obligationItems: UpcomingPayment[];
  dipsBelowBuffer: boolean;
}

/**
 * Day-by-day cash projection: current cash + expected salary − recurring payments on their due
 * dates − everyday spending spread evenly per day.
 */
export function cashForecast(ctx: ForecastContext, untilISO: string): CashForecast {
  const days = Math.max(1, Math.ceil((Date.parse(untilISO) - Date.parse(ctx.now)) / DAY_MS));
  const dailyVariable = (ctx.assumptions.monthlyVariableSpend * 12) / 365;
  const salaryKeys = new Set(salaryDatesBetween(ctx, ctx.now, untilISO).map(istDateKey));
  const items = upcomingPayments(ctx.recurring, ctx.now, days).filter((u) => Date.parse(u.dueDate) <= Date.parse(untilISO));
  const byDay = new Map<string, Paise>();
  for (const u of items) byDay.set(u.dueDateKey, (byDay.get(u.dueDateKey) ?? 0) + u.amount);

  let balance = ctx.cash;
  let income = 0;
  let obligations = 0;
  let variable = 0;
  const points: CashForecastPoint[] = [{ date: ctx.now, balance }];
  let lowest = points[0]!;
  const todayKey = istDateKey(ctx.now);
  // Overdue items and items due later today are counted immediately.
  for (const u of items) {
    if (u.dueDateKey <= todayKey) {
      balance -= u.amount;
      obligations += u.amount;
    }
  }
  let carry = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(Date.parse(ctx.now) + d * DAY_MS).toISOString();
    const key = istDateKey(date);
    if (salaryKeys.has(key)) {
      balance += ctx.assumptions.monthlyIncome;
      income += ctx.assumptions.monthlyIncome;
    }
    const due = key > todayKey ? byDay.get(key) ?? 0 : 0;
    balance -= due;
    obligations += due;
    carry += dailyVariable;
    const spend = Math.round(carry);
    carry -= spend;
    balance -= spend;
    variable += spend;
    const point = { date, balance };
    if (balance < lowest.balance) lowest = point;
    if (d % 7 === 0 || d === days) points.push(point);
  }
  return {
    start: ctx.cash,
    end: balance,
    until: untilISO,
    points,
    lowest,
    income,
    obligations,
    variableSpend: variable,
    obligationItems: items,
    dipsBelowBuffer: lowest.balance < ctx.assumptions.safetyBuffer,
  };
}

export interface Affordability {
  amount: Paise;
  verdict: 'YES' | 'TIGHT' | 'NO';
  /** Cash free to spend before next income after obligations, everyday spend and buffer. */
  availableToSpend: Paise;
  untilDate: string;
  untilIsSalary: boolean;
  cash: Paise;
  obligations: Paise;
  expectedSpend: Paise;
  safetyBuffer: Paise;
  /** Projected balance just before next income if the purchase is made today. */
  balanceAfterPurchase: Paise;
  obligationItems: UpcomingPayment[];
}

/** Blueprint §12 "Plan": can I afford X? Uses balance, known obligations, everyday spend and buffer. */
export function affordability(ctx: ForecastContext, amount: Paise): Affordability {
  const next = nextSalaryDate(ctx);
  const until = next ?? new Date(Date.parse(ctx.now) + 30 * DAY_MS).toISOString();
  const beforeIncome = new Date(Date.parse(until) - 60 * 1000).toISOString();
  const f = cashForecast(ctx, beforeIncome);
  const availableToSpend = f.end - ctx.assumptions.safetyBuffer;
  const verdict: Affordability['verdict'] =
    amount <= availableToSpend ? 'YES' : amount <= f.end ? 'TIGHT' : 'NO';
  return {
    amount,
    verdict,
    availableToSpend,
    untilDate: until,
    untilIsSalary: next != null,
    cash: ctx.cash,
    obligations: f.obligations,
    expectedSpend: f.variableSpend,
    safetyBuffer: ctx.assumptions.safetyBuffer,
    balanceAfterPurchase: f.end - amount,
    obligationItems: f.obligationItems,
  };
}

export interface InvestCapacity {
  suggested: Paise;
  availableToSpend: Paise;
  untilDate: string;
  plannedInvestments: Paise;
  basis: Affordability;
}

/** How much more could be invested before the next salary, keeping the buffer intact. */
export function investCapacity(ctx: ForecastContext): InvestCapacity {
  const basis = affordability(ctx, 0);
  const planned = basis.obligationItems.filter((u) => u.type === 'INVESTMENT').reduce((s, u) => s + u.amount, 0);
  // Round down to the nearest ₹500.
  const suggested = Math.max(0, Math.floor(basis.availableToSpend / 50000) * 50000);
  return { suggested, availableToSpend: basis.availableToSpend, untilDate: basis.untilDate, plannedInvestments: planned, basis };
}

export interface ProjectionPoint {
  date: string;
  monthKey: string;
  value: Paise;
}

export interface NetWorthProjection {
  until: string;
  start: Paise;
  end: Paise;
  changePct: number | null;
  points: ProjectionPoint[];
  monthlySavings: Paise;
  monthlySip: Paise;
  monthlyEpf: Paise;
  assumptions: ForecastAssumptions;
}

/** Default projection horizon: December of next year. */
export function defaultProjectionDate(nowISO: string): string {
  const { year } = istParts(nowISO);
  return new Date(Date.parse(istToISO(year + 2, 1, 1)) - 1).toISOString();
}

/**
 * Month-by-month net worth projection (Blueprint §14). Cash grows by expected monthly savings,
 * mutual funds by SIPs + assumed return, deposits by their own rates, EPF by contributions + rate.
 */
export function projectNetWorth(state: FinancialState, ctx: ForecastContext, untilISO = defaultProjectionDate(state.now)): NetWorthProjection {
  const nw = netWorth(state);
  const a = ctx.assumptions;
  const sip = monthlyRecurringOutflow(ctx.recurring, 'INVESTMENT');
  const recurringExpense = monthlyRecurringOutflow(ctx.recurring, 'EXPENSE');
  const monthlySavings = a.monthlyIncome - a.monthlyVariableSpend - recurringExpense - sip;
  const linked = new Set(state.accounts.filter((x) => x.linked).map((x) => x.id));
  const epfAccounts = state.holdings.epf.filter((e) => linked.has(e.accountId));
  const contributions = epfAccounts.flatMap((e) => e.entries.filter((x) => x.kind === 'CONTRIBUTION')).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  const lastThree = contributions.slice(-3);
  const monthlyEpf = lastThree.length ? Math.round(lastThree.reduce((s, x) => s + x.amount, 0) / lastThree.length) : 0;

  let cash = nw.lines.find((l) => l.kind === 'SAVINGS')?.value ?? 0;
  let mf = nw.lines.find((l) => l.kind === 'MUTUAL_FUNDS')?.value ?? 0;
  let epf = nw.lines.find((l) => l.kind === 'EPF')?.value ?? 0;
  const receivable = nw.lines.find((l) => l.kind === 'RECEIVABLES')?.value ?? 0;
  const fds = state.holdings.termDeposits.filter((f) => linked.has(f.accountId));

  const points: ProjectionPoint[] = [{ date: state.now, monthKey: istMonthKey(state.now), value: nw.netWorth }];
  let d = state.now;
  let guard = 0;
  while (guard++ < 600) {
    const next = addMonthsISO(d, 1);
    if (Date.parse(next) > Date.parse(untilISO)) break;
    d = next;
    cash = Math.round(cash * (1 + a.savingsRatePct / 100 / 12)) + monthlySavings;
    mf = Math.round(mf * (1 + a.mfReturnPct / 100 / 12)) + sip;
    epf = Math.round(epf * (1 + a.epfRatePct / 100 / 12)) + monthlyEpf;
    const fd = fds.reduce((s, f) => {
      if (Date.parse(d) <= Date.parse(f.maturesAt)) return s + fdValueAt(f, d);
      // After maturity assume it is renewed at the same rate.
      const renewed = { ...f, principal: fdValueAt(f, f.maturesAt), openedAt: f.maturesAt, maturesAt: '9999-12-31T00:00:00.000Z' };
      return s + fdValueAt(renewed, d);
    }, 0);
    points.push({ date: d, monthKey: istMonthKey(d), value: cash + mf + epf + fd + receivable });
  }
  const end = points[points.length - 1]!.value;
  return {
    until: untilISO,
    start: nw.netWorth,
    end,
    changePct: pctChange(nw.netWorth, end),
    points,
    monthlySavings,
    monthlySip: sip,
    monthlyEpf,
    assumptions: a,
  };
}
