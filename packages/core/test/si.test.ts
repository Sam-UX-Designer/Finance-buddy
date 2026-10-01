import { describe, expect, it } from 'vitest';
import { detectIntent, extractAmount } from '../src/si/intents';
import { answer, checkGrounding } from '../src/si/compose';
import { makeEnv } from '../src/si/tools';
import { account, at, buildTxns, NOW, state, type RawSpec } from './fixtures';

describe('SI intent detection', () => {
  it('routes the suggested questions', () => {
    expect(detectIntent('Why did I spend more this month?', NOW).intent).toBe('EXPLAIN_SPEND');
    expect(detectIntent('How much can I invest this month?', NOW).intent).toBe('INVEST_CAPACITY');
    expect(detectIntent('Show my subscription payments', NOW).intent).toBe('SUBSCRIPTIONS');
    expect(detectIntent('Am I on track for my goals?', NOW).intent).toBe('GOALS');
    expect(detectIntent('Compare this month with last month', NOW).intent).toBe('COMPARE_MONTHS');
    expect(detectIntent('What should I know this week?', NOW).intent).toBe('BRIEF');
    expect(detectIntent('Where can I reduce spending?', NOW).intent).toBe('COACH');
  });
  it('extracts entities', () => {
    const d = detectIntent('Can I afford a ₹30,000 purchase?', NOW);
    expect(d).toMatchObject({ intent: 'AFFORD', entities: { amount: 3000000 } });
    expect(extractAmount('1.5 lakh')).toBe(15000000);
    expect(extractAmount('30k')).toBe(3000000);
    expect(extractAmount('in 2027')).toBeUndefined();
    const f = detectIntent('How much will I have by December?', NOW);
    expect(f.intent).toBe('FORECAST');
    expect(f.entities.untilLabel).toBe('the end of December 2026');
    expect(detectIntent('How much did I spend on food last month?', NOW)).toMatchObject({ intent: 'CATEGORY_SPEND', entities: { categoryId: 'food', monthKey: '2026-09' } });
  });
});

describe('SI answers are grounded in engine facts', () => {
  function env() {
    const a = account('hdfc', '4821', 40000);
    const specs: RawSpec[] = [];
    for (const m of [6, 7, 8, 9, 10]) {
      specs.push({ accountId: 'hdfc', at: at(m, 1, 9), amount: 60000, direction: 'CREDIT', narration: `NEFT/CR/N${m}/ACME TECHNOLOGIES PVT LTD/SALARY` });
      specs.push({ accountId: 'hdfc', at: at(m, 14), amount: 199, direction: 'DEBIT', narration: 'UPI/DR/1/NETFLIX/netflix@hdfcbank/Monthly' });
      for (const d of [4, 11]) specs.push({ accountId: 'hdfc', at: at(m, d, 20), amount: 900, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' });
    }
    const txns = buildTxns([a], specs.filter((s) => Date.parse(s.at) <= Date.parse(NOW)));
    return makeEnv(state([a], txns));
  }
  it('answers subscriptions from detected recurring payments', () => {
    const r = answer(env(), 'Show my subscription payments');
    expect(r.text).toContain('1 subscription found');
    expect(r.bullets[0]).toContain('Netflix: ₹199 a month');
    expect(checkGrounding(r.text + r.bullets.join(' '), r.toolResults).ok).toBe(true);
  });
  it('says so when there is not enough evidence', () => {
    const r = answer(env(), 'Am I on track for my goals?');
    expect(r.text).toContain("haven't set any goals");
  });
  it('rejects text containing numbers not present in the facts', () => {
    const r = answer(env(), 'Show my subscription payments');
    expect(checkGrounding('You spend ₹999 on subscriptions.', r.toolResults).ok).toBe(false);
    expect(checkGrounding('You spend about ₹199 a month on Netflix.', r.toolResults).ok).toBe(true);
  });
  it('falls back to capabilities for unknown questions', () => {
    const r = answer(env(), 'Tell me a joke');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.insufficient).toBe(true);
  });
});
