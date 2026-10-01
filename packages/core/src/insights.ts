import { category } from './categories';
import { addMonthsToKey, DAY_MS, formatMonthKey, istMonthKey, istParts, monthEndISO, monthStartISO } from './dates';
import { inRange, spendByCategory, totalsOf, type CategorySpend } from './ledger';
import { formatINR, pctChange, type Paise } from './money';
import { cashForecast, forecastContext, nextSalaryDate, type ForecastContext } from './forecast';
import { projectGoal } from './goals';
import { upcomingPayments } from './recurring';
import { cashLedger, completeMonthsWithData, sameWindowSpend } from './summary';
import type { CategoryId, FinancialState } from './types';

export type InsightTone = 'positive' | 'attention' | 'info';

export interface Insight {
  id: string;
  kind: 'CATEGORY_SPIKE' | 'LOW_BALANCE_RISK' | 'UPCOMING_LARGE_PAYMENT';
  tone: InsightTone;
  title: string;
  body: string;
  categoryId?: CategoryId;
  /** Question SI answers when the user taps "See why". */
  question: string;
  facts: Record<string, number | string>;
  score: number;
}

const MIN_CURRENT = 100000; // ₹1,000
const MIN_DIFF = 50000; // ₹500
const MIN_PCT = 15;

export interface CategorySpike {
  categoryId: CategoryId;
  current: Paise;
  baseline: Paise;
  changePct: number;
  /** 'MTD' compares this month so far with the same days of previous months; 'LAST_MONTH' compares the last full month. */
  window: 'MTD' | 'LAST_MONTH';
  monthKey: string;
  baselineMonths: string[];
}

function average(rows: CategorySpend[][], id: CategoryId): Paise {
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((s, r) => s + (r.find((c) => c.categoryId === id)?.spent ?? 0), 0) / rows.length);
}

/**
 * Finds categories where spending is meaningfully above the user's usual level.
 * Early in a month (< 5 days) it evaluates the last complete month instead. Needs ≥ 2 baseline months.
 */
export function categorySpikes(state: FinancialState): CategorySpike[] {
  const entries = cashLedger(state);
  const months = completeMonthsWithData(state.txns, state.now);
  const nowKey = istMonthKey(state.now);
  const dayOfMonth = istParts(state.now).day;
  let window: CategorySpike['window'];
  let monthKey: string;
  let current: CategorySpend[];
  let baselineMonths: string[];
  let baselines: CategorySpend[][];
  if (dayOfMonth >= 5) {
    window = 'MTD';
    monthKey = nowKey;
    baselineMonths = months.slice(-3);
    current = spendByCategory(inRange(entries, monthStartISO(nowKey), new Date(Date.parse(state.now) + 1).toISOString()));
    baselines = baselineMonths.map((m) => sameWindowSpend(entries, m, state.now));
  } else {
    window = 'LAST_MONTH';
    monthKey = addMonthsToKey(nowKey, -1);
    if (!months.includes(monthKey)) return [];
    baselineMonths = months.filter((m) => m < monthKey).slice(-3);
    current = spendByCategory(inRange(entries, monthStartISO(monthKey), monthEndISO(monthKey)));
    baselines = baselineMonths.map((m) => spendByCategory(inRange(entries, monthStartISO(m), monthEndISO(m))));
  }
  if (baselineMonths.length < 2) return [];
  const out: CategorySpike[] = [];
  for (const c of current) {
    if (c.categoryId === 'rent' || c.categoryId === 'family' || c.categoryId === 'other') continue;
    const baseline = average(baselines, c.categoryId);
    const pct = pctChange(baseline, c.spent);
    if (baseline <= 0 || pct == null) continue;
    if (c.spent >= MIN_CURRENT && c.spent - baseline >= MIN_DIFF && pct >= MIN_PCT) {
      out.push({ categoryId: c.categoryId, current: c.spent, baseline, changePct: pct, window, monthKey, baselineMonths });
    }
  }
  return out.sort((a, b) => b.current - b.baseline - (a.current - a.baseline));
}

/** The single most useful observation for Home, or null when there isn't enough evidence. */
export function topInsight(state: FinancialState, ctx: ForecastContext = forecastContext(state)): Insight | null {
  const candidates: Insight[] = [];
  const spike = categorySpikes(state)[0];
  if (spike) {
    const name = category(spike.categoryId).name.toLowerCase();
    const when = spike.window === 'MTD' ? 'this month' : `in ${formatMonthKey(spike.monthKey)}`;
    candidates.push({
      id: `spike:${spike.categoryId}:${spike.monthKey}`,
      kind: 'CATEGORY_SPIKE',
      tone: 'attention',
      title: 'SI noticed',
      body: `Your spending on ${name} is ${formatINR(spike.current, { decimals: 0 })} ${when}, ${Math.round(spike.changePct)}% higher than your usual average.`,
      categoryId: spike.categoryId,
      question: `Why is my ${name} spending higher?`,
      facts: { current: spike.current, baseline: spike.baseline, changePct: spike.changePct },
      score: spike.current - spike.baseline,
    });
  }
  const next = nextSalaryDate(ctx);
  if (next) {
    const f = cashForecast(ctx, new Date(Date.parse(next) - 60000).toISOString());
    if (f.lowest.balance < ctx.assumptions.safetyBuffer) {
      candidates.push({
        id: `lowbal:${istMonthKey(state.now)}`,
        kind: 'LOW_BALANCE_RISK',
        tone: 'attention',
        title: 'SI noticed',
        body: `Your balance may drop to ${formatINR(f.lowest.balance, { decimals: 0 })} before your next salary, below your ${formatINR(ctx.assumptions.safetyBuffer, { decimals: 0 })} safety buffer.`,
        question: 'Will I run low on money before my next salary?',
        facts: { lowest: f.lowest.balance, buffer: ctx.assumptions.safetyBuffer },
        score: ctx.assumptions.safetyBuffer - f.lowest.balance + 1_000_000,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

export interface BriefItem {
  id: string;
  tone: InsightTone;
  text: string;
  facts: Record<string, number | string>;
}

export interface Brief {
  generatedAt: string;
  items: BriefItem[];
  /** False when there isn't enough history to say anything meaningful. */
  enoughData: boolean;
}

/** Blueprint §12 "Brief": what should I know this week? Each line is backed by engine facts. */
export function weeklyBrief(state: FinancialState, ctx: ForecastContext = forecastContext(state)): Brief {
  const items: BriefItem[] = [];
  const entries = cashLedger(state);
  const now = Date.parse(state.now);
  const thisWeek = totalsOf(inRange(entries, new Date(now - 7 * DAY_MS).toISOString(), new Date(now + 1).toISOString())).spent;
  const lastWeek = totalsOf(inRange(entries, new Date(now - 14 * DAY_MS).toISOString(), new Date(now - 7 * DAY_MS).toISOString())).spent;
  const weekPct = pctChange(lastWeek, thisWeek);
  if (thisWeek > 0 && lastWeek > 0 && weekPct != null) {
    const r = Math.round(Math.abs(weekPct));
    items.push({
      id: 'week-spend',
      tone: weekPct >= 10 ? 'attention' : weekPct <= -10 ? 'positive' : 'info',
      text:
        r < 5
          ? `Your spending is steady this week (${formatINR(thisWeek, { decimals: 0 })})`
          : `Your spending ${weekPct > 0 ? 'increased' : 'decreased'} ${r}% this week`,
      facts: { thisWeek, lastWeek, changePct: weekPct },
    });
  }

  const upcoming = upcomingPayments(ctx.recurring, state.now, 7);
  if (upcoming.length > 0) {
    const total = upcoming.reduce((s, u) => s + u.amount, 0);
    items.push({
      id: 'upcoming',
      tone: 'info',
      text: `You have ${upcoming.length} upcoming payment${upcoming.length === 1 ? '' : 's'} (${formatINR(total, { decimals: 0 })})`,
      facts: { count: upcoming.length, total },
    });
  }

  const months = completeMonthsWithData(state.txns, state.now);
  const lastMonth = months[months.length - 1];
  if (lastMonth && lastMonth === addMonthsToKey(istMonthKey(state.now), -1)) {
    const t = totalsOf(inRange(entries, monthStartISO(lastMonth), monthEndISO(lastMonth)));
    if (t.income > 0) {
      const rate = Math.round(((t.income - t.spent) / t.income) * 100);
      items.push({
        id: 'savings-rate',
        tone: rate >= 20 ? 'positive' : rate < 0 ? 'attention' : 'info',
        text: `Your savings rate last month was ${rate}%`,
        facts: { income: t.income, spent: t.spent, ratePct: rate },
      });
    }
  }

  if (state.goals.length > 0) {
    const projections = state.goals.map((g) => projectGoal(g, state.now, ctx.assumptions.goalReturnPct));
    const onTrack = projections.filter((p) => p.onTrack).length;
    items.push({
      id: 'goals',
      tone: onTrack === projections.length ? 'positive' : 'attention',
      text:
        onTrack === projections.length
          ? `You're on track for ${projections.length === 1 ? 'your goal' : `all ${projections.length} goals`}`
          : `${onTrack} of ${projections.length} goals are on track`,
      facts: { onTrack, total: projections.length },
    });
  }

  return { generatedAt: state.now, items: items.slice(0, 4), enoughData: items.length > 0 };
}
