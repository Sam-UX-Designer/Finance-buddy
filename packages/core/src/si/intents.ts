import { addMonthsToKey, istMonthKey, istParts, istToISO, monthEndISO, pad2 } from '../dates';
import type { Paise } from '../money';
import type { CategoryId } from '../types';

export const INTENTS = [
  'BRIEF',
  'EXPLAIN_SPEND',
  'CATEGORY_SPEND',
  'COMPARE_MONTHS',
  'SUBSCRIPTIONS',
  'UPCOMING',
  'AFFORD',
  'INVEST_CAPACITY',
  'FORECAST',
  'COACH',
  'GOALS',
  'NET_WORTH',
  'BALANCE',
  'LOANS',
  'SALARY_CYCLE',
  'UNKNOWN',
] as const;
export type Intent = (typeof INTENTS)[number];

export interface Entities {
  amount?: Paise;
  categoryId?: CategoryId;
  monthKey?: string;
  /** Target date for forecasts (exclusive end, ISO). */
  until?: string;
  untilLabel?: string;
}

export interface DetectedIntent {
  intent: Intent;
  entities: Entities;
  confidence: number;
}

const CATEGORY_WORDS: [RegExp, CategoryId][] = [
  [/\b(food|eating out|restaurants?|dining|swiggy|zomato|takeaway|delivery)\b/, 'food'],
  [/\b(grocer(y|ies)|blinkit|zepto|bigbasket|dmart)\b/, 'groceries'],
  [/\b(shopping|amazon|flipkart|myntra|clothes)\b/, 'shopping'],
  [/\b(transport|cabs?|uber|ola|rapido|metro|commute)\b/, 'transport'],
  [/\b(fuel|petrol|diesel)\b/, 'fuel'],
  [/\b(bills?|electricity|recharge|internet|broadband|utilities)\b/, 'bills'],
  [/\b(rent)\b/, 'rent'],
  [/\b(subscriptions?|netflix|spotify|ott)\b/, 'subscriptions'],
  [/\b(entertainment|movies?)\b/, 'entertainment'],
  [/\b(health|medical|medicine|pharmacy|gym|fitness)\b/, 'health'],
  [/\b(travel|trips?|flights?|hotels?)\b/, 'travel'],
  [/\b(family|parents)\b/, 'family'],
  [/\b(insurance)\b/, 'insurance'],
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Parses "₹30,000", "30k", "1.5 lakh", "2L", "45000" into paise. */
export function extractAmount(text: string): Paise | undefined {
  const t = text.toLowerCase().replace(/,/g, '');
  const m = t.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|lac|cr|crore)?\b/);
  if (!m) return undefined;
  // Avoid treating years or percentages as amounts.
  const raw = Number(m[1]);
  const unit = m[2];
  if (!unit && /%/.test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 2))) return undefined;
  if (!unit && raw >= 1900 && raw <= 2100 && !/₹|rs|inr/.test(m[0])) return undefined;
  let rupees = raw;
  if (unit === 'k' || unit === 'thousand') rupees = raw * 1_000;
  else if (unit === 'l' || unit === 'lakh' || unit === 'lakhs' || unit === 'lac') rupees = raw * 100_000;
  else if (unit === 'cr' || unit === 'crore') rupees = raw * 10_000_000;
  if (!Number.isFinite(rupees) || rupees <= 0) return undefined;
  return Math.round(rupees * 100);
}

export function extractCategory(text: string): CategoryId | undefined {
  const t = text.toLowerCase();
  for (const [re, id] of CATEGORY_WORDS) if (re.test(t)) return id;
  return undefined;
}

/** Month referenced in the text: "last month", "this month", "september". */
export function extractMonth(text: string, nowISO: string): string | undefined {
  const t = text.toLowerCase();
  const nowKey = istMonthKey(nowISO);
  if (/\blast month\b|\bprevious month\b/.test(t)) return addMonthsToKey(nowKey, -1);
  if (/\bthis month\b/.test(t)) return nowKey;
  const { year, month } = istParts(nowISO);
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(${MONTHS[i]}|${MONTHS_SHORT[i]})\\b`);
    if (re.test(t)) {
      // Most recent occurrence not in the future.
      const y = i + 1 > month ? year - 1 : year;
      return `${y}-${pad2(i + 1)}`;
    }
  }
  return undefined;
}

/** Last minute of an IST month (so dates display as the 30th/31st, not the 1st of the next month). */
function monthLastMinute(key: string): string {
  return new Date(Date.parse(monthEndISO(key)) - 60_000).toISOString();
}

/** Forecast target: "by December", "end of the month", "next month", "in 6 months". */
export function extractUntil(text: string, nowISO: string): { until: string; label: string } | undefined {
  const t = text.toLowerCase();
  const nowKey = istMonthKey(nowISO);
  const { year, month } = istParts(nowISO);
  if (/end of (the |this )?month|month end|month-end/.test(t)) {
    return { until: monthLastMinute(nowKey), label: 'the end of this month' };
  }
  if (/next month/.test(t)) {
    return { until: monthLastMinute(addMonthsToKey(nowKey, 1)), label: 'the end of next month' };
  }
  const inN = t.match(/in (\d{1,2}) months?/);
  if (inN) {
    const n = Number(inN[1]);
    return { until: monthLastMinute(addMonthsToKey(nowKey, n)), label: `${n} months from now` };
  }
  if (/end of (the )?year|year end|this year/.test(t)) {
    return { until: new Date(Date.parse(istToISO(year + 1, 1, 1)) - 60_000).toISOString(), label: `the end of ${year}` };
  }
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(by|till|until|in|end of)\\s+(${MONTHS[i]}|${MONTHS_SHORT[i]})\\b`);
    if (re.test(t)) {
      const y = i + 1 >= month ? year : year + 1;
      const key = `${y}-${pad2(i + 1)}`;
      return { until: monthLastMinute(key), label: `the end of ${MONTHS[i]![0]!.toUpperCase()}${MONTHS[i]!.slice(1)} ${y}` };
    }
  }
  return undefined;
}

const RULES: [Intent, RegExp][] = [
  ['AFFORD', /\b(afford|can i (buy|spend|purchase|get))\b/],
  ['INVEST_CAPACITY', /\b(how much (can|should) i (invest|save))\b|\binvest this month\b/],
  ['EXPLAIN_SPEND', /\bwhy\b.*\b(spen[dt]|spending|expenses?|higher|more)\b/],
  ['COMPARE_MONTHS', /\b(compare|comparison|vs\.?|versus)\b/],
  ['SUBSCRIPTIONS', /\b(subscriptions?|recurring)\b/],
  ['UPCOMING', /\b(upcoming|due|coming up|next payments?|bills? (coming|due))\b/],
  ['FORECAST', /\b(how much will i have|forecast|project(ion|ed)?|by (the )?end of|will i (have|run))\b/],
  ['COACH', /\b(reduce|cut( down)?|save more|spend less|where can i (save|cut)|lower my)\b/],
  ['GOALS', /\b(goals?|on track)\b/],
  ['NET_WORTH', /\bnet ?worth\b|\bwealth\b|\bhow rich\b/],
  ['LOANS', /\b(owes? me|lent|loan|borrowed|receivables?)\b/],
  ['SALARY_CYCLE', /\b(salary cycle|since (my )?(last )?salary|this cycle|pay ?cycle)\b/],
  ['CATEGORY_SPEND', /\b(how much|what).*\b(spen[dt]|spending)\b|\bspent on\b/],
  ['BALANCE', /\b(balance|how much (money )?(do )?i have)\b/],
  ['BRIEF', /\b(what should i know|this week|summary|summari[sz]e|brief|how am i doing|overview|insights?)\b/],
];

export function detectIntent(text: string, nowISO: string): DetectedIntent {
  const t = text.toLowerCase().trim();
  const entities: Entities = {};
  const amount = extractAmount(t);
  const categoryId = extractCategory(t);
  const monthKey = extractMonth(t, nowISO);
  const until = extractUntil(t, nowISO);
  if (categoryId) entities.categoryId = categoryId;
  if (monthKey) entities.monthKey = monthKey;
  if (until) {
    entities.until = until.until;
    entities.untilLabel = until.label;
  }
  for (const [intent, re] of RULES) {
    if (re.test(t)) {
      if (intent === 'AFFORD' && amount) entities.amount = amount;
      if (intent === 'AFFORD' && !amount) return { intent, entities, confidence: 0.6 };
      return { intent, entities, confidence: 0.9 };
    }
  }
  if (categoryId) return { intent: 'CATEGORY_SPEND', entities, confidence: 0.6 };
  return { intent: 'UNKNOWN', entities, confidence: 0 };
}
