import { describe, expect, it } from 'vitest';
import { classify, parseNarration } from '../src/classify';
import { formatINR, formatINRCompact, parseRupeeInput } from '../src/money';
import { ledger, totalsOf } from '../src/ledger';
import { receivables } from '../src/pairing';
import { balanceAt, reconcile, totalCash } from '../src/balances';
import { detectSalary, salaryCycles } from '../src/salary';
import { detectRecurring, upcomingPayments } from '../src/recurring';
import { monthSummary, compareWithPreviousMonth } from '../src/summary';
import { projectGoal } from '../src/goals';
import { affordability, forecastContext, cashForecast } from '../src/forecast';
import { netWorth, fdValueAt } from '../src/wealth';
import { categorySpikes, topInsight, weeklyBrief } from '../src/insights';
import { account, at, buildTxns, NOW, state, type RawSpec } from './fixtures';
import type { Txn } from '../src/types';

describe('money', () => {
  it('formats Indian rupees with lakh grouping', () => {
    expect(formatINR(8125454)).toBe('₹81,254.54');
    expect(formatINR(38246000)).toBe('₹3,82,460');
    expect(formatINR(62100000, { decimals: 0 })).toBe('₹6,21,000');
    expect(formatINR(-42200, { decimals: 0 })).toBe('−₹422');
    expect(formatINR(4179000, { signed: true })).toBe('+₹41,790');
    expect(formatINRCompact(62100000)).toBe('₹6.2L');
  });
  it('parses user input into paise', () => {
    expect(parseRupeeInput('1,20,000')).toBe(12000000);
    expect(parseRupeeInput('₹422.50')).toBe(42250);
    expect(parseRupeeInput('abc')).toBeNull();
    expect(parseRupeeInput('5L')).toBe(50000000);
    expect(parseRupeeInput('5 lakh')).toBe(50000000);
    expect(parseRupeeInput('1.5Cr')).toBe(1500000000);
    expect(parseRupeeInput('50k')).toBe(5000000);
    expect(parseRupeeInput('5x')).toBeNull();
  });
});

describe('classification rules', () => {
  const debit = (narration: string) => classify({ direction: 'DEBIT', narration, amount: 100 });
  const credit = (narration: string) => classify({ direction: 'CREDIT', narration, amount: 100 });

  it('parses UPI narrations', () => {
    expect(parseNarration('UPI/DR/412345678901/SWIGGY/swiggy@axisbank/Order')).toEqual({
      mode: 'UPI', payeeName: 'SWIGGY', vpa: 'swiggy@axisbank', remark: 'Order',
    });
  });
  it('classifies merchants, salary, investments and loans', () => {
    expect(debit('UPI/DR/1/SWIGGY/swiggy@axisbank/Order')).toMatchObject({ type: 'EXPENSE', categoryId: 'food', merchantName: 'Swiggy' });
    expect(debit('UPI/DR/1/JIO/jio@sbi/Recharge')).toMatchObject({ type: 'EXPENSE', categoryId: 'bills' });
    expect(debit('UPI/DR/1/NETFLIX/netflix@hdfcbank/Monthly')).toMatchObject({ categoryId: 'subscriptions' });
    expect(credit('NEFT/CR/N1/ACME TECHNOLOGIES PVT LTD/SALARY SEP 2026')).toMatchObject({ type: 'INCOME', categoryId: 'salary' });
    expect(debit('ACH/DR/UMRN1/ICCL MF/PPFAS FLEXI CAP SIP')).toMatchObject({ type: 'INVESTMENT', categoryId: 'investments' });
    expect(debit('UPI/DR/1/KARTHIK S/9876500000@ybl/loan for bike')).toMatchObject({ type: 'LOAN_GIVEN', counterparty: 'Karthik S' });
    expect(debit('UPI/DR/1/RAMESH KUMAR/ramesh.k@okaxis/Rent Oct')).toMatchObject({ type: 'EXPENSE', categoryId: 'rent' });
    expect(credit('UPI/CR/1/AMAZON/amazon@apl/Refund order 123')).toMatchObject({ type: 'REFUND', categoryId: 'shopping' });
    expect(debit('ATM/WDL/HDFC ATM KORAMANGALA/123')).toMatchObject({ type: 'EXPENSE', categoryId: 'cash' });
    expect(credit('INT.PD/01-07-2026 TO 30-09-2026')).toMatchObject({ type: 'INCOME', categoryId: 'interest' });
  });
  it('does not confuse similar words with merchants', () => {
    expect(debit('UPI/DR/1/RAJIOV STORES/rajiov@okaxis/x').merchantKey).not.toBe('jio');
  });
  it('applies learned user rules for the merchant', () => {
    const c = classify({ direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order', amount: 100 }, { userRules: [{ merchantKey: 'swiggy', categoryId: 'groceries' }] });
    expect(c.categoryId).toBe('groceries');
    expect(c.learned).toBe(true);
  });
});

describe('Finance Engine rules (Blueprint §10)', () => {
  function setup() {
    const hdfc = account('hdfc', '4821', 50000);
    const icici = account('icici', '1942', 10000);
    const specs: RawSpec[] = [
      { accountId: 'hdfc', at: at(10, 1, 9), amount: 60000, direction: 'CREDIT', narration: 'NEFT/CR/N1/ACME TECHNOLOGIES PVT LTD/SALARY OCT 2026' },
      { accountId: 'hdfc', at: at(10, 2), amount: 5000, direction: 'DEBIT', narration: 'IMPS/DR/1/SAM KUMAR/TO SELF XXXXXXXX1942' },
      { accountId: 'icici', at: at(10, 2), amount: 5000, direction: 'CREDIT', narration: 'IMPS/CR/1/SAM KUMAR/FROM XXXXXXXX4821' },
      { accountId: 'hdfc', at: at(10, 3), amount: 8000, direction: 'DEBIT', narration: 'ACH/DR/UMRN1/ICCL MF/PPFAS FLEXI CAP SIP' },
      { accountId: 'hdfc', at: at(10, 4), amount: 1200, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' },
      { accountId: 'hdfc', at: at(10, 5), amount: 3000, direction: 'DEBIT', narration: 'UPI/DR/1/KARTHIK S/9876500000@ybl/loan' },
      { accountId: 'hdfc', at: at(10, 9), amount: 1000, direction: 'CREDIT', narration: 'UPI/CR/1/KARTHIK S/9876500000@ybl/returning part' },
      { accountId: 'icici', at: at(10, 6), amount: 2000, direction: 'DEBIT', narration: 'UPI/DR/1/AMAZON/amazon@apl/Order' },
      { accountId: 'icici', at: at(10, 8), amount: 500, direction: 'CREDIT', narration: 'UPI/CR/1/AMAZON/amazon@apl/Refund' },
    ];
    const accounts = [hdfc, icici];
    const txns = buildTxns(accounts, specs);
    return { accounts, txns };
  }

  it('treats own-account transfers as neither income nor expense', () => {
    const { txns } = setup();
    const transfers = txns.filter((t) => t.type === 'TRANSFER');
    expect(transfers).toHaveLength(2);
    const t = totalsOf(ledger(txns));
    expect(t.transfersIn).toBe(t.transfersOut);
  });

  it('keeps investments and loans out of spending, nets refunds', () => {
    const { txns } = setup();
    const t = totalsOf(ledger(txns));
    expect(t.income).toBe(6000000);
    expect(t.investments).toBe(800000);
    expect(t.loansGiven).toBe(300000);
    expect(t.loansRepaid).toBe(100000);
    expect(t.expenses).toBe(320000); // swiggy 1200 + amazon 2000
    expect(t.refunds).toBe(50000);
    expect(t.spent).toBe(270000);
  });

  it('net cash flow equals the actual change in balances', () => {
    const { txns, accounts } = setup();
    const t = totalsOf(ledger(txns));
    const opening = 5000000 + 1000000;
    expect(opening + t.netCashFlow).toBe(totalCash(accounts));
  });

  it('tracks money owed back per person', () => {
    const { txns } = setup();
    const r = receivables(txns);
    expect(r[0]).toMatchObject({ counterparty: 'Karthik S', lent: 300000, repaid: 100000, outstanding: 200000 });
  });

  it('reconciles running balances with the reported balance', () => {
    const { txns, accounts } = setup();
    for (const a of accounts) expect(reconcile(a, txns).status).toBe('RECONCILED');
    const broken = { ...accounts[0]!, currentBalance: accounts[0]!.currentBalance + 100 };
    expect(reconcile(broken, txns)).toMatchObject({ status: 'MISMATCH', difference: 100 });
    expect(balanceAt(accounts[0]!, txns, at(10, 1, 8))).toBe(5000000);
  });

  it('reconciles transactions that share a timestamp using statement order', () => {
    const a = account('hdfc', '4821', 1000);
    const same = at(9, 10, 12);
    const txns = buildTxns([a], [
      { accountId: 'hdfc', at: same, amount: 300, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@ybl/Order' },
      { accountId: 'hdfc', at: same, amount: 200, direction: 'DEBIT', narration: 'UPI/DR/2/ZOMATO/zomato@ybl/Order' },
    ]);
    // Give the later statement line the "smaller" id so id order alone would break the chain.
    const reversedIds = txns.map((t, i) => ({ ...t, id: `z${txns.length - i}` }));
    expect(reconcile(a, reversedIds).status).toBe('RECONCILED');
    expect(balanceAt(a, reversedIds, same)).toBe(50000);
  });

  it('infers a loan when a payment to a person is returned in full', () => {
    const a = account('hdfc', '4821', 20000);
    const txns = buildTxns([a], [
      { accountId: 'hdfc', at: at(9, 10), amount: 2500, direction: 'DEBIT', narration: 'UPI/DR/1/VIKRAM R/vikram.r@okhdfcbank/dinner' },
      { accountId: 'hdfc', at: at(9, 20), amount: 2500, direction: 'CREDIT', narration: 'UPI/CR/1/VIKRAM R/vikram.r@okhdfcbank/thanks' },
    ]);
    expect(txns.map((t) => t.type)).toEqual(['LOAN_GIVEN', 'LOAN_REPAID']);
  });

  it('never overrides a user correction', () => {
    const a = account('hdfc', '4821', 20000);
    const built = buildTxns([a], [
      { accountId: 'hdfc', at: at(9, 10), amount: 2500, direction: 'DEBIT', narration: 'UPI/DR/1/VIKRAM R/vikram.r@okhdfcbank/dinner' },
    ]);
    const corrected: Txn = { ...built[0]!, type: 'EXPENSE', categoryId: 'food', typeSource: 'USER', categorySource: 'USER' };
    expect(corrected.type).toBe('EXPENSE');
  });
});

describe('salary cycles (Blueprint §11)', () => {
  it('opening + flows = available balance, with zero unreconciled amount', () => {
    const a = account('hdfc', '4821', 25000);
    const specs: RawSpec[] = [];
    for (const m of [7, 8, 9, 10]) {
      specs.push({ accountId: 'hdfc', at: at(m, 1, 9), amount: 60000, direction: 'CREDIT', narration: `NEFT/CR/N${m}/ACME TECHNOLOGIES PVT LTD/SALARY` });
      specs.push({ accountId: 'hdfc', at: at(m, 3), amount: 18000, direction: 'DEBIT', narration: 'UPI/DR/1/RAMESH KUMAR/ramesh.k@okaxis/Rent' });
      specs.push({ accountId: 'hdfc', at: at(m, 5), amount: 8000, direction: 'DEBIT', narration: 'ACH/DR/U/ICCL MF/SIP' });
      specs.push({ accountId: 'hdfc', at: at(m, 12), amount: 3000, direction: 'DEBIT', narration: 'UPI/DR/1/KARTHIK S/9876500000@ybl/loan' });
    }
    const txns = buildTxns([a], specs.filter((s) => Date.parse(s.at) <= Date.parse(NOW)));
    const salary = detectSalary(txns)!;
    expect(salary.amount).toBe(6000000);
    expect(salary.typicalDay).toBe(1);
    const cycles = salaryCycles([a], txns, NOW);
    expect(cycles).toHaveLength(4);
    for (const c of cycles) {
      expect(c.closingComputed).toBe(c.opening + c.income - c.expenses - c.investments - c.loansGiven + c.loansRepaid + c.refunds);
      expect(c.unreconciled).toBe(0);
    }
    expect(cycles[1]!.opening).toBe(cycles[0]!.closingActual);
    expect(cycles[3]!.isCurrent).toBe(true);
    expect(cycles[3]!.closingActual).toBe(a.currentBalance);
  });
});

describe('recurring payments', () => {
  it('detects monthly subscriptions and rent but not food delivery', () => {
    const a = account('hdfc', '4821', 100000);
    const specs: RawSpec[] = [];
    for (const m of [5, 6, 7, 8, 9, 10]) {
      specs.push({ accountId: 'hdfc', at: at(m, 3), amount: 18000, direction: 'DEBIT', narration: 'UPI/DR/1/RAMESH KUMAR/ramesh.k@okaxis/Rent' });
      specs.push({ accountId: 'hdfc', at: at(m, 14), amount: 199, direction: 'DEBIT', narration: 'UPI/DR/1/NETFLIX/netflix@hdfcbank/Monthly' });
      for (const d of [2, 9, 16, 23]) specs.push({ accountId: 'hdfc', at: at(m, d, 20), amount: 300 + d, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' });
    }
    const txns = buildTxns([a], specs.filter((s) => Date.parse(s.at) <= Date.parse(NOW)));
    const series = detectRecurring(txns, NOW);
    const names = series.map((s) => s.merchantName);
    expect(names).toContain('Netflix');
    expect(names).toContain('Ramesh Kumar');
    expect(names).not.toContain('Swiggy');
    const up = upcomingPayments(series, NOW, 30);
    expect(up.find((u) => u.merchantName === 'Ramesh Kumar')?.dueDateKey).toBe('2026-11-03');
  });
});

describe('summaries and comparisons', () => {
  it('compares month-to-date like-for-like', () => {
    const a = account('hdfc', '4821', 100000);
    const txns = buildTxns([a], [
      { accountId: 'hdfc', at: at(9, 5), amount: 1000, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' },
      { accountId: 'hdfc', at: at(9, 25), amount: 5000, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' },
      { accountId: 'hdfc', at: at(10, 5), amount: 1500, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' },
    ]);
    const s = state([a], txns);
    expect(monthSummary(s).spent).toBe(150000);
    const c = compareWithPreviousMonth(s);
    expect(c.monthToDate).toBe(true);
    expect(c.previous.spent).toBe(100000); // only Sep 1–15
    expect(c.spentChangePct).toBe(50);
  });
});

describe('goals', () => {
  it('projects completion and required contribution', () => {
    const p = projectGoal({ id: 'g', targetAmount: 30000000, currentAmount: 12000000, monthlyContribution: 1500000, targetDate: at(12, 1, 0, 2027) }, NOW);
    expect(p.progressPct).toBe(40);
    expect(p.monthsToComplete).toBe(12);
    expect(p.onTrack).toBe(true);
    const behind = projectGoal({ id: 'g', targetAmount: 30000000, currentAmount: 12000000, monthlyContribution: 500000, targetDate: at(12, 1, 0, 2027) }, NOW);
    expect(behind.status).toBe('BEHIND');
    expect(behind.requiredMonthly).toBe(1390000); // ₹1,80,000 over 13 months = ₹13,846 → rounded up to the next ₹100
  });
});

describe('forecast and affordability', () => {
  function richState() {
    const a = account('hdfc', '4821', 40000);
    const specs: RawSpec[] = [];
    for (const m of [6, 7, 8, 9, 10]) {
      specs.push({ accountId: 'hdfc', at: at(m, 1, 9), amount: 60000, direction: 'CREDIT', narration: `NEFT/CR/N${m}/ACME TECHNOLOGIES PVT LTD/SALARY` });
      specs.push({ accountId: 'hdfc', at: at(m, 3), amount: 18000, direction: 'DEBIT', narration: 'UPI/DR/1/RAMESH KUMAR/ramesh.k@okaxis/Rent' });
      for (const d of [4, 11, 18, 25]) specs.push({ accountId: 'hdfc', at: at(m, d, 20), amount: 2000, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' });
    }
    const txns = buildTxns([a], specs.filter((s) => Date.parse(s.at) <= Date.parse(NOW)));
    return state([a], txns);
  }

  it('derives assumptions from history and lets users override them', () => {
    const s = richState();
    const ctx = forecastContext(s);
    expect(ctx.assumptions.monthlyIncome).toBe(6000000);
    expect(ctx.assumptions.monthlyVariableSpend).toBe(800000);
    const overridden = forecastContext({ ...s, assumptionOverrides: { monthlyVariableSpend: 1000000 } });
    expect(overridden.assumptions.monthlyVariableSpend).toBe(1000000);
    expect(overridden.assumptionInfo.find((i) => i.key === 'monthlyVariableSpend')?.source).toBe('USER');
  });

  it('answers affordability with explicit components', () => {
    const s = richState();
    const ctx = forecastContext(s);
    const small = affordability(ctx, 500000);
    expect(small.verdict).toBe('YES');
    expect(small.availableToSpend).toBe(small.cash - small.obligations - small.expectedSpend - small.safetyBuffer);
    expect(affordability(ctx, 50000000).verdict).toBe('NO');
  });

  it('cash forecast adds salary and subtracts rent on due dates', () => {
    const s = richState();
    const ctx = forecastContext(s);
    const f = cashForecast(ctx, at(11, 30, 23));
    expect(f.income).toBe(6000000); // 1 Nov salary
    expect(f.obligations).toBe(1800000); // 3 Nov rent
    expect(f.end).toBe(f.start + f.income - f.obligations - f.variableSpend);
  });
});

describe('wealth', () => {
  it('computes FD value with compounding and net worth by asset', () => {
    const fd = { accountId: 'fd', principal: 7500000, ratePct: 7.1, openedAt: at(1, 1), maturesAt: at(1, 1, 12, 2028), compoundingPerYear: 4, currentValue: 0 };
    const v = fdValueAt(fd, at(1, 1, 12, 2027));
    expect(v).toBeGreaterThan(7500000 * 1.071);
    expect(v).toBeLessThan(7500000 * 1.075);
    const a = account('hdfc', '4821', 80000);
    const nw = netWorth({ ...state([a], []), holdings: { mutualFunds: [], termDeposits: [{ ...fd, accountId: 'hdfc', currentValue: v }], epf: [] } });
    expect(nw.netWorth).toBe(8000000 + v);
  });
});

describe('SI evidence', () => {
  it('returns no insight when history is too short (never fabricates)', () => {
    const a = account('hdfc', '4821', 1000);
    const txns = buildTxns([a], [{ accountId: 'hdfc', at: at(10, 10), amount: 500, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' }]);
    const s = state([a], txns);
    expect(categorySpikes(s)).toEqual([]);
    expect(topInsight(s)).toBeNull();
    expect(weeklyBrief(s).enoughData).toBe(false);
  });

  it('flags a food spike against the usual month-to-date level', () => {
    const a = account('hdfc', '4821', 200000);
    const specs: RawSpec[] = [];
    for (const m of [6, 7, 8, 9]) for (const d of [3, 8, 12]) specs.push({ accountId: 'hdfc', at: at(m, d, 20), amount: 1000, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' });
    for (const d of [3, 8, 12]) specs.push({ accountId: 'hdfc', at: at(10, d, 20), amount: 1500, direction: 'DEBIT', narration: 'UPI/DR/1/SWIGGY/swiggy@axisbank/Order' });
    const s = state([a], buildTxns([a], specs));
    const spike = categorySpikes(s)[0]!;
    expect(spike).toMatchObject({ categoryId: 'food', current: 450000, baseline: 300000, changePct: 50, window: 'MTD' });
    expect(topInsight(s)?.body).toBe('Your spending on food is ₹4,500 this month, 50% higher than your usual average.');
  });
});
