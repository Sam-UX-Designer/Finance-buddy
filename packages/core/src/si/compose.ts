import { category } from '../categories';
import { formatINR } from '../money';
import type { Affordability } from '../forecast';
import { detectIntent, type DetectedIntent, type Entities, type Intent } from './intents';
import { runTool, type ToolEnv, type ToolResult } from './tools';

export interface SIAnswer {
  intent: Intent;
  text: string;
  bullets: string[];
  followUps: string[];
  toolResults: ToolResult[];
  /** True when SI lacked evidence and said so rather than guessing. */
  insufficient: boolean;
}

type Step = { tool: string; input?: Record<string, unknown> };

/** Which engine tools answer each intent (Blueprint §13: intent → Finance Query Engine → explanation). */
export function planFor(d: DetectedIntent, nowISO: string): Step[] {
  const e = d.entities;
  switch (d.intent) {
    case 'BRIEF':
      return [{ tool: 'get_weekly_brief' }];
    case 'EXPLAIN_SPEND':
      return [{ tool: 'explain_spending_change', input: e.categoryId ? { category: e.categoryId } : {} }];
    case 'CATEGORY_SPEND':
      return e.categoryId ? [{ tool: 'get_category_spend', input: { category: e.categoryId, month: e.monthKey } }] : [{ tool: 'get_month_summary', input: { month: e.monthKey } }];
    case 'COMPARE_MONTHS':
      return [{ tool: 'compare_months', input: { month: e.monthKey } }];
    case 'SUBSCRIPTIONS':
      return [{ tool: 'find_subscriptions' }];
    case 'UPCOMING':
      return [{ tool: 'get_upcoming_payments', input: { days: 30 } }];
    case 'AFFORD':
      return e.amount ? [{ tool: 'check_affordability', input: { amount_rupees: e.amount / 100 } }] : [];
    case 'INVEST_CAPACITY':
      return [{ tool: 'get_invest_capacity' }];
    case 'FORECAST': {
      const longRange = e.until && Date.parse(e.until) - Date.parse(nowISO) > 120 * 24 * 3600 * 1000;
      return longRange ? [{ tool: 'project_net_worth', input: { until: e.until } }] : [{ tool: 'forecast_balance', input: e.until ? { until: e.until } : {} }];
    }
    case 'COACH':
      return [{ tool: 'coach_reduce_spending' }];
    case 'GOALS':
      return [{ tool: 'get_goals_status' }];
    case 'NET_WORTH':
      return [{ tool: 'get_net_worth' }];
    case 'BALANCE':
      return [{ tool: 'get_balance' }];
    case 'LOANS':
      return [{ tool: 'get_receivables' }];
    case 'SALARY_CYCLE':
      return [{ tool: 'get_salary_cycle' }];
    case 'UNKNOWN':
      return [];
  }
}

export const DEFAULT_SUGGESTIONS = [
  'Why did I spend more this month?',
  'How much can I invest this month?',
  'Show my subscription payments',
  'Am I on track for my goals?',
];

const FOLLOW_UPS: Partial<Record<Intent, string[]>> = {
  BRIEF: ['Why did I spend more this month?', 'Show my upcoming payments'],
  EXPLAIN_SPEND: ['Where can I reduce spending?', 'Compare this month with last month'],
  CATEGORY_SPEND: ['Compare this month with last month', 'Where can I reduce spending?'],
  COMPARE_MONTHS: ['Why did I spend more this month?', 'What should I know this week?'],
  SUBSCRIPTIONS: ['Show my upcoming payments', 'Where can I reduce spending?'],
  UPCOMING: ['How much will I have by the end of the month?', 'Show my subscription payments'],
  AFFORD: ['How much can I invest this month?', 'Show my upcoming payments'],
  INVEST_CAPACITY: ['Am I on track for my goals?', 'What is my net worth?'],
  FORECAST: ['Can I afford ₹30,000?', 'Show my upcoming payments'],
  COACH: ['Show my subscription payments', 'Compare this month with last month'],
  GOALS: ['How much can I invest this month?', 'What is my net worth?'],
  NET_WORTH: ['How much will I have by December next year?', 'Am I on track for my goals?'],
  BALANCE: ['How much will I have by the end of the month?', 'What should I know this week?'],
  LOANS: ['What is my net worth?', 'What should I know this week?'],
  SALARY_CYCLE: ['How much can I invest this month?', 'Show my upcoming payments'],
};

function lead(intent: Intent, results: ToolResult[], entities: Entities): { text: string; bullets: string[] } {
  const r = results[0];
  if (!r) {
    if (intent === 'AFFORD') return { text: 'How much is the purchase? For example: “Can I afford ₹30,000?”', bullets: [] };
    return {
      text: 'I can answer questions about your spending, balance, bills, goals, net worth and forecasts, using your connected accounts. Try one of these:',
      bullets: [],
    };
  }
  const facts = r.facts;
  if (r.insufficient && intent !== 'GOALS') {
    return { text: `I don't have enough evidence to answer that yet. ${facts[0] ?? ''}`.trim(), bullets: facts.slice(1) };
  }
  switch (intent) {
    case 'BRIEF':
      return { text: "Here's what I noticed this week:", bullets: facts };
    case 'EXPLAIN_SPEND': {
      const focus = r.data.focus as string | null;
      const spikes = r.data.spikes as unknown[];
      if (spikes.length === 0 && !entities.categoryId) return { text: facts[0]!, bullets: facts.slice(1) };
      const name = focus ? category(focus as never).name.toLowerCase() : 'spending';
      return { text: spikes.length ? `Most of the increase comes from ${name}.` : `Here's how your ${name} spending compares with usual:`, bullets: facts };
    }
    case 'AFFORD': {
      const a = r.data as unknown as Affordability;
      const amt = formatINR(a.amount, { decimals: 0 });
      const when = a.untilIsSalary ? 'before your next salary' : 'over the next 30 days';
      const text =
        a.verdict === 'YES'
          ? `Yes, you can afford ${amt} and still keep your safety buffer ${when}.`
          : a.verdict === 'TIGHT'
            ? `It's tight. ${amt} would dip into your ${formatINR(a.safetyBuffer, { decimals: 0 })} safety buffer ${when}.`
            : `Not comfortably. ${amt} is more than you can spare ${when}.`;
      return { text, bullets: facts };
    }
    case 'COACH':
      return { text: 'Here are the easiest places to save, based on your last 3 months:', bullets: facts };
    case 'GOALS': {
      if (r.insufficient) return { text: "You haven't set any goals yet. Add one in Plan and I'll track it for you.", bullets: [] };
      const goals = (r.data.goals as { onTrack: boolean }[]) ?? [];
      const on = goals.filter((g) => g.onTrack).length;
      const text = on === goals.length ? "Yes, you're on track for all your goals." : `${on} of ${goals.length} goals are on track.`;
      return { text, bullets: facts };
    }
    default:
      return { text: facts[0] ?? '', bullets: facts.slice(1) };
  }
}

/** Deterministic SI answer: intent → engine tools → template explanation. No LLM involved. */
export function answer(env: ToolEnv, question: string, detected = detectIntent(question, env.state.now)): SIAnswer {
  const steps = planFor(detected, env.state.now);
  const results = steps.map((s) => runTool(env, s.tool, s.input ?? {}));
  const { text, bullets } = lead(detected.intent, results, detected.entities);
  return {
    intent: detected.intent,
    text,
    bullets,
    followUps: FOLLOW_UPS[detected.intent] ?? DEFAULT_SUGGESTIONS,
    toolResults: results,
    insufficient: results.some((r) => r.insufficient) || detected.intent === 'UNKNOWN',
  };
}

/** Numbers (as values) mentioned in a text: "₹4,820", "22%", "1.5". */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Guard for LLM-written text (Blueprint §12/§13: SI must not invent numbers).
 * Every number in the text must match (within 1%) a number present in the engine facts or the question.
 */
export function checkGrounding(text: string, results: ToolResult[], question = ''): { ok: boolean; unknown: number[] } {
  const allowed = new Set<number>();
  for (const r of results) for (const f of r.facts) for (const n of extractNumbers(f)) allowed.add(n);
  for (const n of extractNumbers(question)) allowed.add(n);
  const allowedList = [...allowed];
  const unknown = extractNumbers(text).filter((n) => {
    if (Number.isInteger(n) && n <= 12) return false; // small counts like "3 payments", "2 goals"
    return !allowedList.some((a) => Math.abs(a - n) <= Math.max(1, Math.abs(a) * 0.01));
  });
  return { ok: unknown.length === 0, unknown };
}
