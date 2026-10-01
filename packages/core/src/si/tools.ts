import { totalCash, depositAccounts } from '../balances';
import { category } from '../categories';
import { formatDate, formatMonthKey, istMonthKey, monthEndISO, monthStartISO } from '../dates';
import {
  affordability,
  cashForecast,
  forecastContext,
  investCapacity,
  projectNetWorth,
  type ForecastContext,
} from '../forecast';
import { projectGoal } from '../goals';
import { categorySpikes, weeklyBrief } from '../insights';
import { inRange, spendByMerchant } from '../ledger';
import type { Paise } from '../money';
import { formatINR, pctChange } from '../money';
import { receivables } from '../pairing';
import { monthlyEquivalent, subscriptions, upcomingPayments } from '../recurring';
import { salaryCycles } from '../salary';
import { cashLedger, compareWithPreviousMonth, completeMonthsWithData, monthSummary, sameWindowSpend } from '../summary';
import type { CategoryId, FinancialState } from '../types';
import { netWorth, netWorthChangeThisYear } from '../wealth';

/** JSON-schema-ish description of a tool input (kept simple so it maps to LLM tool definitions). */
export interface ToolParam {
  type: 'string' | 'number';
  description: string;
  enum?: string[];
}

export interface ToolDef<I = Record<string, unknown>> {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  required?: string[];
  run: (env: ToolEnv, input: I) => ToolResult;
}

export interface ToolEnv {
  state: FinancialState;
  ctx: ForecastContext;
}

export interface ToolResult {
  tool: string;
  /** Structured, deterministic output from the Finance Engine (amounts in paise). */
  data: Record<string, unknown>;
  /** Human-readable facts derived from `data`. These are the only facts SI may state. */
  facts: string[];
  /** True when the engine lacks evidence to answer. SI must say so instead of guessing. */
  insufficient?: boolean;
}

export function makeEnv(state: FinancialState): ToolEnv {
  return { state, ctx: forecastContext(state) };
}

const inr = (p: Paise) => formatINR(p, { decimals: 0 });
const CATEGORY_ENUM = [
  'food', 'groceries', 'shopping', 'transport', 'fuel', 'bills', 'rent', 'subscriptions', 'entertainment',
  'health', 'family', 'people', 'travel', 'education', 'insurance', 'cash', 'personal', 'other',
];

export const TOOLS: ToolDef<any>[] = [
  {
    name: 'get_balance',
    description: 'Current total balance across connected bank accounts, per account.',
    params: {},
    run: ({ state }) => {
      const accounts = depositAccounts(state.accounts);
      const total = totalCash(state.accounts);
      return {
        tool: 'get_balance',
        data: { total, accounts: accounts.map((a) => ({ name: a.displayName, mask: a.maskedNumber.slice(-4), balance: a.currentBalance })) },
        facts: [
          `Total balance is ${formatINR(total)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'}.`,
          ...accounts.map((a) => `${a.displayName} ••${a.maskedNumber.slice(-4)}: ${formatINR(a.currentBalance)}.`),
        ],
      };
    },
  },
  {
    name: 'get_month_summary',
    description: 'Income, spending, investments and top categories for a calendar month (default: current month).',
    params: { month: { type: 'string', description: 'Month as YYYY-MM. Defaults to the current month.' } },
    run: ({ state }, input: { month?: string }) => {
      const key = input.month ?? istMonthKey(state.now);
      const s = monthSummary(state, key);
      const label = key === istMonthKey(state.now) ? 'this month so far' : `in ${formatMonthKey(key)}`;
      return {
        tool: 'get_month_summary',
        data: { month: key, income: s.income, spent: s.spent, investments: s.investments, loansGiven: s.loansGiven, savingsRatePct: s.savingsRatePct, byCategory: s.byCategory.slice(0, 6) },
        facts: [
          `Income ${label}: ${inr(s.income)}.`,
          `Spent ${label}: ${inr(s.spent)}.`,
          `Invested ${label}: ${inr(s.investments)}.`,
          ...s.byCategory.slice(0, 4).map((c) => `${category(c.categoryId).name}: ${inr(c.spent)}.`),
        ],
        insufficient: s.count === 0,
      };
    },
  },
  {
    name: 'compare_months',
    description: 'Compares spending and income of a month with the previous month (like-for-like if the month is in progress).',
    params: { month: { type: 'string', description: 'Month as YYYY-MM. Defaults to the current month.' } },
    run: ({ state }, input: { month?: string }) => {
      const key = input.month ?? istMonthKey(state.now);
      const c = compareWithPreviousMonth(state, key);
      const prevKey = monthKeyMinus(key);
      const label = c.monthToDate ? `so far this month vs the same days of ${formatMonthKey(prevKey)}` : `${formatMonthKey(key)} vs ${formatMonthKey(prevKey)}`;
      const top = c.categoryChanges.filter((x) => x.change !== 0).slice(0, 3);
      return {
        tool: 'compare_months',
        data: {
          month: key,
          monthToDate: c.monthToDate,
          spent: c.current.spent,
          previousSpent: c.previous.spent,
          spentChangePct: c.spentChangePct,
          income: c.current.income,
          previousIncome: c.previous.income,
          categoryChanges: top,
        },
        facts: [
          `Spending ${label}: ${inr(c.current.spent)} vs ${inr(c.previous.spent)}${c.spentChangePct != null ? ` (${signedPct(c.spentChangePct)})` : ''}.`,
          `Income: ${inr(c.current.income)} vs ${inr(c.previous.income)}.`,
          ...top.map((x) => `${category(x.categoryId).name}: ${inr(x.current)} vs ${inr(x.previous)} (${x.change >= 0 ? '+' : '−'}${inr(Math.abs(x.change))}).`),
        ],
        insufficient: c.previous.count === 0,
      };
    },
  },
  {
    name: 'explain_spending_change',
    description: 'Explains why spending is higher than usual: which categories and merchants drove the change.',
    params: { category: { type: 'string', description: 'Optional category id to focus on.', enum: CATEGORY_ENUM } },
    run: ({ state }, input: { category?: CategoryId }) => {
      const entries = cashLedger(state);
      const months = completeMonthsWithData(state.txns, state.now).slice(-3);
      if (months.length < 2) {
        return { tool: 'explain_spending_change', data: { months }, facts: ['Not enough history yet: at least 2 complete months are needed to know your usual spending.'], insufficient: true };
      }
      const nowKey = istMonthKey(state.now);
      const fromNow = monthStartISO(nowKey);
      const currentEntries = inRange(entries, fromNow, new Date(Date.parse(state.now) + 1).toISOString());
      const spikes = categorySpikes(state);
      const focus = input.category ?? spikes[0]?.categoryId;
      const facts: string[] = [];
      const drivers: { merchant: string; current: Paise; usual: Paise; change: Paise }[] = [];
      if (spikes.length === 0 && !input.category) {
        facts.push('No category is meaningfully above your usual spending right now (we flag changes of 15% and ₹500 or more).');
      }
      for (const s of spikes.slice(0, 3)) {
        facts.push(
          `${category(s.categoryId).name}: ${inr(s.current)} ${s.window === 'MTD' ? 'this month so far' : `in ${formatMonthKey(s.monthKey)}`} vs a usual ${inr(s.baseline)} for the same period (${signedPct(s.changePct)}).`,
        );
      }
      if (focus) {
        const spike = spikes.find((s) => s.categoryId === focus);
        const window = spike?.window ?? 'MTD';
        const scopeCurrent = window === 'MTD'
          ? currentEntries
          : inRange(entries, monthStartISO(spike!.monthKey), monthEndISO(spike!.monthKey));
        const cur = spendByMerchant(scopeCurrent.filter((e) => e.categoryId === focus));
        const baseRows = months.map((m) => {
          const scoped = window === 'MTD'
            ? inRange(entries, monthStartISO(m), new Date(Date.parse(monthStartISO(m)) + (Date.parse(state.now) - Date.parse(fromNow)) + 1).toISOString())
            : inRange(entries, monthStartISO(m), monthEndISO(m));
          return spendByMerchant(scoped.filter((e) => e.categoryId === focus));
        });
        for (const m of cur.slice(0, 5)) {
          const usual = Math.round(baseRows.reduce((s, r) => s + (r.find((x) => x.merchantKey === m.merchantKey)?.spent ?? 0), 0) / baseRows.length);
          drivers.push({ merchant: m.merchantName, current: m.spent, usual, change: m.spent - usual });
        }
        drivers.sort((a, b) => b.change - a.change);
        for (const d of drivers.slice(0, 3)) {
          if (d.change > 0) facts.push(`${d.merchant}: ${inr(d.current)} vs a usual ${inr(d.usual)}.`);
        }
        const counts = cur.reduce((s, m) => s + m.count, 0);
        if (counts > 0) facts.push(`${counts} ${category(focus).name.toLowerCase()} payment${counts === 1 ? '' : 's'} in this period.`);
        if (!spike && input.category) {
          const usualCat = Math.round(months.map((m) => sameWindowSpend(entries, m, state.now).find((c) => c.categoryId === focus)?.spent ?? 0).reduce((s, v) => s + v, 0) / months.length);
          const curCat = cur.reduce((s, m) => s + m.spent, 0);
          facts.push(`${category(focus).name} so far this month: ${inr(curCat)} vs a usual ${inr(usualCat)} by this point${pctChange(usualCat, curCat) != null ? ` (${signedPct(pctChange(usualCat, curCat)!)})` : ''}.`);
        }
      }
      return { tool: 'explain_spending_change', data: { spikes, focus: focus ?? null, drivers }, facts };
    },
  },
  {
    name: 'get_category_spend',
    description: 'Spending in one category for a month, with top merchants.',
    params: {
      category: { type: 'string', description: 'Category id.', enum: CATEGORY_ENUM },
      month: { type: 'string', description: 'Month as YYYY-MM. Defaults to the current month.' },
    },
    required: ['category'],
    run: ({ state }, input: { category: CategoryId; month?: string }) => {
      const key = input.month ?? istMonthKey(state.now);
      const s = monthSummary(state, key);
      const row = s.byCategory.find((c) => c.categoryId === input.category);
      const entries = inRange(cashLedger(state), s.from, new Date(Date.parse(s.to) + 1).toISOString()).filter((e) => e.categoryId === input.category);
      const merchants = spendByMerchant(entries).slice(0, 3);
      const label = key === istMonthKey(state.now) ? 'this month so far' : `in ${formatMonthKey(key)}`;
      const name = category(input.category).name;
      return {
        tool: 'get_category_spend',
        data: { month: key, category: input.category, spent: row?.spent ?? 0, count: row?.count ?? 0, merchants },
        facts: [
          `${name} spending ${label}: ${inr(row?.spent ?? 0)} across ${row?.count ?? 0} payment${row?.count === 1 ? '' : 's'}.`,
          ...merchants.filter((m) => m.spent > 0).map((m) => `${m.merchantName}: ${inr(m.spent)}.`),
        ],
      };
    },
  },
  {
    name: 'find_subscriptions',
    description: 'Recurring subscriptions and memberships detected from payment history.',
    params: {},
    run: ({ ctx }) => {
      const subs = subscriptions(ctx.recurring);
      const monthly = subs.reduce((s, x) => s + monthlyEquivalent(x), 0);
      return {
        tool: 'find_subscriptions',
        data: { count: subs.length, monthlyTotal: monthly, items: subs.map((s) => ({ name: s.merchantName, amount: s.averageAmount, cadence: s.cadence, nextDue: s.nextDueDate })) },
        facts: subs.length
          ? [
              `${subs.length} subscription${subs.length === 1 ? '' : 's'} found, about ${inr(monthly)} a month (${inr(monthly * 12)} a year).`,
              ...subs.map((s) => `${s.merchantName}: ${inr(s.averageAmount)} ${cadenceLabel(s.cadence)}, next on ${formatDate(s.nextDueDate)}.`),
            ]
          : ['No recurring subscriptions found in your connected accounts.'],
      };
    },
  },
  {
    name: 'get_upcoming_payments',
    description: 'Known recurring payments (bills, rent, SIPs, subscriptions) due in the next N days.',
    params: { days: { type: 'number', description: 'Look-ahead window in days (default 30).' } },
    run: ({ state, ctx }, input: { days?: number }) => {
      const days = input.days ?? 30;
      const items = upcomingPayments(ctx.recurring, state.now, days);
      const total = items.reduce((s, u) => s + u.amount, 0);
      return {
        tool: 'get_upcoming_payments',
        data: { days, count: items.length, total, items },
        facts: items.length
          ? [
              `${items.length} payment${items.length === 1 ? '' : 's'} due in the next ${days} days, ${inr(total)} in total.`,
              ...items.slice(0, 6).map((u) => `${u.merchantName}: ${inr(u.amount)} on ${formatDate(u.dueDate)}.`),
            ]
          : [`No known payments due in the next ${days} days.`],
      };
    },
  },
  {
    name: 'check_affordability',
    description: 'Checks whether a purchase is affordable before the next salary, keeping obligations and a safety buffer.',
    params: { amount_rupees: { type: 'number', description: 'Purchase amount in rupees.' } },
    required: ['amount_rupees'],
    run: ({ ctx }, input: { amount_rupees: number }) => {
      const a = affordability(ctx, Math.round(input.amount_rupees * 100));
      const until = a.untilIsSalary ? `your next salary on ${formatDate(a.untilDate)}` : formatDate(a.untilDate);
      return {
        tool: 'check_affordability',
        data: { ...a },
        facts: [
          `Balance now: ${inr(a.cash)}.`,
          `Known payments before ${until}: ${inr(a.obligations)}.`,
          `Expected everyday spending until then: ${inr(a.expectedSpend)}.`,
          `Safety buffer kept aside: ${inr(a.safetyBuffer)}.`,
          `Free to spend before ${until}: ${inr(Math.max(0, a.availableToSpend))}.`,
          `After a ${inr(a.amount)} purchase you'd have about ${formatINR(a.balanceAfterPurchase, { decimals: 0 })} just before ${a.untilIsSalary ? 'your salary' : 'then'}.`,
        ],
      };
    },
  },
  {
    name: 'get_invest_capacity',
    description: 'How much more can be invested before the next salary without touching obligations or the safety buffer.',
    params: {},
    run: ({ ctx }) => {
      const c = investCapacity(ctx);
      return {
        tool: 'get_invest_capacity',
        data: { suggested: c.suggested, availableToSpend: c.availableToSpend, plannedInvestments: c.plannedInvestments, untilDate: c.untilDate },
        facts: [
          `You could invest about ${inr(c.suggested)} more before ${formatDate(c.untilDate)}.`,
          `Already planned investments (SIPs) in that period: ${inr(c.plannedInvestments)} — these are already accounted for.`,
          `This keeps your ${inr(ctx.assumptions.safetyBuffer)} safety buffer and expected everyday spending of ${inr(c.basis.expectedSpend)}.`,
        ],
      };
    },
  },
  {
    name: 'forecast_balance',
    description: 'Projects bank balance to a date using expected salary, recurring payments and everyday spending.',
    params: { until: { type: 'string', description: 'ISO date to forecast to. Defaults to the end of this month.' } },
    run: ({ state, ctx }, input: { until?: string }) => {
      const until = input.until ?? new Date(Date.parse(monthEndISO(istMonthKey(state.now))) - 60_000).toISOString();
      const f = cashForecast(ctx, until);
      return {
        tool: 'forecast_balance',
        data: { until, start: f.start, end: f.end, lowest: f.lowest, income: f.income, obligations: f.obligations, variableSpend: f.variableSpend },
        facts: [
          `Projected balance on ${formatDate(until)}: ${formatINR(f.end, { decimals: 0 })} (from ${inr(f.start)} today).`,
          `Expected income: ${inr(f.income)}; known payments: ${inr(f.obligations)}; everyday spending: ${inr(f.variableSpend)}.`,
          `Lowest point: ${formatINR(f.lowest.balance, { decimals: 0 })} around ${formatDate(f.lowest.date)}.`,
        ],
      };
    },
  },
  {
    name: 'project_net_worth',
    description: 'Projects net worth to a date using savings, SIPs, deposit rates and assumed returns.',
    params: { until: { type: 'string', description: 'ISO date. Defaults to December of next year.' } },
    run: ({ state, ctx }, input: { until?: string }) => {
      const p = projectNetWorth(state, ctx, input.until);
      return {
        tool: 'project_net_worth',
        data: { until: p.until, start: p.start, end: p.end, changePct: p.changePct, monthlySavings: p.monthlySavings, monthlySip: p.monthlySip, mfReturnPct: p.assumptions.mfReturnPct },
        facts: [
          `Projected net worth by ${formatDate(p.until)}: ${inr(p.end)} (today ${inr(p.start)}${p.changePct != null ? `, ${signedPct(p.changePct)}` : ''}).`,
          `Assumes ${inr(p.monthlySavings)} saved and ${inr(p.monthlySip)} invested each month, with a ${p.assumptions.mfReturnPct}% yearly mutual fund return.`,
        ],
      };
    },
  },
  {
    name: 'get_net_worth',
    description: 'Current net worth with assets breakdown and change this year (split into market/interest vs savings).',
    params: {},
    run: ({ state }) => {
      const nw = netWorth(state);
      const ch = netWorthChangeThisYear(state);
      return {
        tool: 'get_net_worth',
        data: { netWorth: nw.netWorth, lines: nw.lines, change: ch },
        facts: [
          `Net worth: ${inr(nw.netWorth)}.`,
          ...nw.lines.map((l) => `${l.label}: ${inr(l.value)}.`),
          `Change since ${formatDate(ch.sinceDate)}: ${ch.change >= 0 ? '+' : '−'}${inr(Math.abs(ch.change))}${ch.changePct != null ? ` (${signedPct(ch.changePct)})` : ''} — ${inr(ch.fromMarketAndInterest)} from market and interest, ${formatINR(ch.fromSavings, { decimals: 0 })} from your savings.`,
        ],
      };
    },
  },
  {
    name: 'get_goals_status',
    description: 'Progress and projected completion for each goal.',
    params: {},
    run: ({ state, ctx }) => {
      const rows = state.goals.map((g) => ({ goal: g, p: projectGoal(g, state.now, ctx.assumptions.goalReturnPct) }));
      return {
        tool: 'get_goals_status',
        data: { goals: rows.map(({ goal, p }) => ({ name: goal.name, target: goal.targetAmount, current: goal.currentAmount, monthly: goal.monthlyContribution, ...p })) },
        facts: rows.length
          ? rows.map(({ goal, p }) =>
              p.status === 'COMPLETED'
                ? `${goal.name}: completed.`
                : p.status === 'NO_CONTRIBUTION'
                  ? `${goal.name}: ${p.progressPct}% done; no monthly contribution set, so it won't complete on its own. ${inr(p.requiredMonthly)}/month would reach it by ${formatDate(goal.targetDate)}.`
                  : `${goal.name}: ${p.progressPct}% done, ${p.onTrack ? 'on track' : 'behind'} — expected by ${formatDate(p.projectedCompletionDate!)} (target ${formatDate(goal.targetDate)}).${p.onTrack ? '' : ` ${inr(p.requiredMonthly)}/month would get you there on time.`}`,
            )
          : ['No goals set yet.'],
        insufficient: rows.length === 0,
      };
    },
  },
  {
    name: 'get_receivables',
    description: 'Money lent to people and still owed back.',
    params: {},
    run: ({ state }) => {
      const r = receivables(state.txns).filter((x) => x.outstanding > 0);
      const total = r.reduce((s, x) => s + x.outstanding, 0);
      return {
        tool: 'get_receivables',
        data: { total, people: r },
        facts: r.length
          ? [`${inr(total)} is owed to you.`, ...r.map((x) => `${x.counterparty}: ${inr(x.outstanding)} (lent ${inr(x.lent)}, repaid ${inr(x.repaid)}).`)]
          : ['No money is currently owed to you based on your transactions.'],
      };
    },
  },
  {
    name: 'get_salary_cycle',
    description: 'Current salary cycle: opening balance, income, spending, investments, loans and available balance.',
    params: {},
    run: ({ state }) => {
      const cycles = salaryCycles(state.accounts, state.txns, state.now);
      const c = cycles[cycles.length - 1];
      if (!c) return { tool: 'get_salary_cycle', data: {}, facts: ['No salary detected yet, so salary cycles are not available.'], insufficient: true };
      return {
        tool: 'get_salary_cycle',
        data: { ...c },
        facts: [
          `Current cycle started ${formatDate(c.start)} with an opening balance of ${inr(c.opening)}.`,
          `Income ${inr(c.income)}, spent ${inr(c.spent)}, invested ${inr(c.investments)}, lent ${inr(c.loansGiven)}, repaid to you ${inr(c.loansRepaid)}.`,
          `Available now: ${inr(c.closingActual)}.`,
        ],
      };
    },
  },
  {
    name: 'coach_reduce_spending',
    description: 'Finds practical places to reduce spending based on the last 3 months (no judgement).',
    params: {},
    run: ({ state, ctx }) => {
      const months = completeMonthsWithData(state.txns, state.now).slice(-3);
      if (months.length === 0) return { tool: 'coach_reduce_spending', data: {}, facts: ['Not enough history yet to suggest savings.'], insufficient: true };
      const entries = cashLedger(state);
      const scoped = inRange(entries, monthStartISO(months[0]!), monthEndISO(months[months.length - 1]!));
      const flexible: CategoryId[] = ['food', 'shopping', 'entertainment', 'transport', 'groceries', 'personal'];
      const ideas: { categoryId: CategoryId; monthlyAvg: Paise; orders: number; avgOrder: Paise; saving: Paise }[] = [];
      for (const id of flexible) {
        const rows = scoped.filter((e) => e.categoryId === id && e.direction === 'DEBIT' && e.type === 'EXPENSE');
        if (rows.length === 0) continue;
        const total = rows.reduce((s, e) => s + e.amount, 0);
        const monthlyAvg = Math.round(total / months.length);
        const ordersPerMonth = Math.round(rows.length / months.length);
        const avgOrder = Math.round(total / rows.length);
        // Saving if a quarter of these payments were skipped.
        const saving = Math.round((ordersPerMonth * avgOrder) / 4);
        if (saving >= 30000) ideas.push({ categoryId: id, monthlyAvg, orders: ordersPerMonth, avgOrder, saving });
      }
      ideas.sort((a, b) => b.saving - a.saving);
      const subs = subscriptions(ctx.recurring);
      const subsMonthly = subs.reduce((s, x) => s + monthlyEquivalent(x), 0);
      const facts = ideas.slice(0, 3).map(
        (i) => `${category(i.categoryId).name}: about ${inr(i.monthlyAvg)}/month over ${i.orders} payments (average ${inr(i.avgOrder)}). Skipping 1 in 4 would save about ${inr(i.saving)}/month.`,
      );
      if (subs.length) facts.push(`Subscriptions cost about ${inr(subsMonthly)}/month — worth checking which you still use.`);
      if (facts.length === 0) facts.push('Your flexible spending is already modest — no clear place to cut.');
      return { tool: 'coach_reduce_spending', data: { ideas, subscriptionsMonthly: subsMonthly }, facts };
    },
  },
  {
    name: 'get_weekly_brief',
    description: 'Proactive summary of meaningful changes, upcoming payments, savings rate and goals.',
    params: {},
    run: ({ state, ctx }) => {
      const b = weeklyBrief(state, ctx);
      return { tool: 'get_weekly_brief', data: { ...b }, facts: b.items.map((i) => i.text + '.'), insufficient: !b.enoughData };
    },
  },
];

export function findTool(name: string): ToolDef<any> | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function runTool(env: ToolEnv, name: string, input: Record<string, unknown> = {}): ToolResult {
  const tool = findTool(name);
  if (!tool) throw new Error(`Unknown SI tool: ${name}`);
  return tool.run(env, input);
}

function monthKeyMinus(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y! * 12 + (m! - 1) - 1;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function signedPct(p: number): string {
  const r = Math.round(p);
  return `${r >= 0 ? '+' : '−'}${Math.abs(r)}%`;
}

function cadenceLabel(c: string): string {
  return c === 'MONTHLY' ? 'a month' : c === 'EVERY_28_DAYS' ? 'every 28 days' : c === 'WEEKLY' ? 'a week' : c === 'QUARTERLY' ? 'a quarter' : 'a year';
}
