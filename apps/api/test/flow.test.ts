import { describe, expect, it } from 'vitest';
import { istToISO, monthSummary, salaryCycles, type HomeDTO, type TxnDTO } from '@finance-buddy/core';
import { createApp } from '../src/app';
import { buildContext } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { hmacHex } from '../src/lib/crypto';
import { financialState } from '../src/services/finance';

const NOW = new Date(istToISO(2026, 10, 1, 10, 30));

async function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', MOCK_AA_LATENCY_MS: '0', ...env } as NodeJS.ProcessEnv);
  const ctx = await buildContext(config, { now: () => NOW });
  const app = createApp(ctx);
  let token = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    return { status: res.status, json };
  };
  return { ctx, app, call, setToken: (t: string) => (token = t) };
}

async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function signIn(t: Awaited<ReturnType<typeof setup>>, phone = '9876543210') {
  const otp = await t.call('POST', '/v1/auth/otp', { phone });
  expect(otp.status).toBe(200);
  const verified = await t.call('POST', '/v1/auth/verify', { challengeId: otp.json.challengeId, code: '123456', deviceName: 'Test', platform: 'web' });
  expect(verified.status).toBe(200);
  t.setToken(verified.json.token);
  return verified.json;
}

async function onboard(t: Awaited<ReturnType<typeof setup>>, pick?: (a: any) => boolean) {
  await t.call('POST', '/v1/aa/discovery');
  const disc = await waitFor(() => t.call('GET', '/v1/aa/discovery'), (r) => r.json.job && r.json.job.status !== 'RUNNING');
  const ids = disc.json.accounts.filter(pick ?? (() => true)).map((a: any) => a.id);
  const consent = await t.call('POST', '/v1/aa/consents', { accountIds: ids });
  const providerId = consent.json.approvalUrl.replace('sandbox:', '');
  await t.call('POST', `/v1/sandbox/consents/${providerId}/approve`);
  const sync = await waitFor(() => t.call('GET', '/v1/sync/latest'), (r) => r.json.job && r.json.job.status !== 'RUNNING');
  return { disc, consent, sync };
}

describe('auth', () => {
  it('validates phone numbers and OTP codes, then creates a session', async () => {
    const t = await setup();
    expect((await t.call('POST', '/v1/auth/otp', { phone: '12345' })).status).toBe(400);
    const otp = await t.call('POST', '/v1/auth/otp', { phone: '+91 98765 43210' });
    expect(otp.json).toMatchObject({ maskedPhone: '+91 98765 43210', devHint: 'Test login: use code 123456' });
    expect((await t.call('POST', '/v1/auth/otp', { phone: '9876543210' })).status).toBe(429); // resend cooldown
    const wrong = await t.call('POST', '/v1/auth/verify', { challengeId: otp.json.challengeId, code: '000000' });
    expect(wrong.json.error.code).toBe('OTP_INVALID');
    const ok = await t.call('POST', '/v1/auth/verify', { challengeId: otp.json.challengeId, code: '123456' });
    expect(ok.json.user.onboardingState).toBe('PHONE_VERIFIED');
    const reuse = await t.call('POST', '/v1/auth/verify', { challengeId: otp.json.challengeId, code: '123456' });
    expect(reuse.json.error.code).toBe('OTP_EXPIRED');
    expect((await t.call('GET', '/v1/me')).status).toBe(401);
    t.setToken(ok.json.token);
    expect((await t.call('GET', '/v1/me')).json.phoneMasked).toContain('3210');
  });
});

describe('end-to-end onboarding and product flow', () => {
  it('discovers, consents, syncs and serves reconciled financial views', async () => {
    const t = await setup();
    await signIn(t);

    const { disc, consent, sync } = await onboard(t);
    expect(disc.json.accounts).toHaveLength(7);
    expect(consent.json).toMatchObject({ status: 'PENDING', purposeCode: '102', fetchType: 'PERIODIC' });
    expect(consent.json.dataShared).toContain('Transaction history (last 12 months)');
    expect(sync.json.job.status).toBe('COMPLETED');
    expect(sync.json.job.steps.every((s: any) => s.status === 'DONE')).toBe(true);

    const me = await t.call('GET', '/v1/me');
    expect(me.json).toMatchObject({ onboardingState: 'READY', name: 'Sam Kumar' });

    // Every account reconciles against the bank-reported balance.
    const accounts = await t.call('GET', '/v1/accounts');
    const deposits = accounts.json.accounts.filter((a: any) => a.type === 'SAVINGS');
    expect(deposits).toHaveLength(4);
    for (const a of deposits) expect(a.reconciliation.status).toBe('RECONCILED');

    // Home numbers trace back to engine state.
    const home: HomeDTO = (await t.call('GET', '/v1/home')).json;
    expect(home.name).toBe('Sam');
    expect(home.balance.total).toBe(accounts.json.totalCash);
    expect(home.balance.accountCount).toBe(4);
    const state = await financialState(t.ctx, me.json.id);
    const month = monthSummary(state);
    expect(home.month).toMatchObject({ income: month.income, spent: month.spent, invested: month.investments });
    expect(home.sync.health).toBe('OK');
    expect(home.upcoming.count).toBeGreaterThan(0);

    // Salary cycles reconcile exactly on the sandbox data (history is never edited).
    const cycles = salaryCycles(state.accounts, state.txns, state.now);
    expect(cycles.length).toBeGreaterThan(6);
    for (const c of cycles) expect(c.unreconciled).toBe(0);

    // Own-account transfers are paired; investments are not expenses.
    const transfers = await t.call('GET', '/v1/transactions?filter=transfers&limit=100');
    expect(transfers.json.total % 2).toBe(0);
    const inv = await t.call('GET', '/v1/transactions?filter=investments&limit=5');
    expect(inv.json.items.every((x: TxnDTO) => x.type === 'INVESTMENT')).toBe(true);
    expect(inv.json.items[0].merchantName).toMatch(/SIP$/);

    // Correction + learned rule applies to the merchant's other transactions.
    const swiggy = await t.call('GET', '/v1/transactions?q=swiggy&limit=100');
    expect(swiggy.json.total).toBeGreaterThan(5);
    const first: TxnDTO = swiggy.json.items[0];
    const patched = await t.call('PATCH', `/v1/transactions/${first.id}`, { categoryId: 'groceries', applyToMerchant: true, note: 'Weekly snacks' });
    expect(patched.json).toMatchObject({ categoryId: 'groceries', categorySource: 'USER', note: 'Weekly snacks' });
    const after = await t.call('GET', '/v1/transactions?q=swiggy&limit=100');
    expect(after.json.items.every((x: TxnDTO) => x.categoryId === 'groceries')).toBe(true);
    expect((await t.call('PATCH', `/v1/transactions/${first.id}`, { type: 'INCOME' })).status).toBe(400);

    // Split: half is the user's, half is owed back.
    const half = Math.floor(first.amount / 2);
    const split = await t.call('PUT', `/v1/transactions/${first.id}/split`, {
      parts: [
        { amount: half, type: 'EXPENSE', categoryId: 'food' },
        { amount: first.amount - half, type: 'LOAN_GIVEN', categoryId: 'loans', counterparty: 'Arjun' },
      ],
    });
    expect(split.json.splits).toHaveLength(2);
    expect((await t.call('PUT', `/v1/transactions/${first.id}/split`, { parts: [{ amount: 1, type: 'EXPENSE', categoryId: 'food' }, { amount: 1, type: 'EXPENSE', categoryId: 'food' }] })).status).toBe(400);

    // Wealth: lines add up to net worth; receivables include the split.
    const wealth = await t.call('GET', '/v1/wealth');
    const linesTotal = wealth.json.lines.reduce((s: number, l: any) => s + l.value, 0);
    expect(wealth.json.netWorth).toBe(linesTotal);
    expect(wealth.json.lines.map((l: any) => l.kind)).toEqual(expect.arrayContaining(['MUTUAL_FUNDS', 'TERM_DEPOSIT', 'SAVINGS', 'EPF']));
    expect(wealth.json.receivables.some((r: any) => r.counterparty === 'Arjun')).toBe(true);
    expect(wealth.json.change.fromMarketAndInterest + wealth.json.change.fromSavings).toBe(wealth.json.change.change);
    expect(wealth.json.trend.length).toBeGreaterThan(6);

    // Plan: goals with projections, editable assumptions.
    const goal = await t.call('POST', '/v1/goals', { name: 'Emergency Fund', emoji: '🛟', targetAmount: 30000000, targetDate: istToISO(2027, 12, 1), currentAmount: 12000000, monthlyContribution: 1500000 });
    expect(goal.status).toBe(201);
    expect(goal.json.projection).toMatchObject({ progressPct: 40, onTrack: true });
    const plan = await t.call('PUT', '/v1/assumptions', { mfReturnPct: 8 });
    expect(plan.json.assumptions.find((a: any) => a.key === 'mfReturnPct')).toMatchObject({ value: 8, source: 'USER' });
    const forecast = await t.call('GET', '/v1/forecast');
    expect(forecast.json.endOfMonth.end).toBe(forecast.json.endOfMonth.start + forecast.json.endOfMonth.income - forecast.json.endOfMonth.obligations - forecast.json.endOfMonth.variableSpend);
    const budgets = await t.call('PUT', '/v1/budgets/food', { monthlyLimit: 600000 });
    expect(budgets.json.budgets[0]).toMatchObject({ categoryId: 'food', limit: 600000 });

    // SI answers from engine tools.
    const subs = await t.call('POST', '/v1/si/ask', { text: 'Show my subscription payments' });
    expect(subs.json.answer.text).toMatch(/subscription/);
    expect(subs.json.answer.bullets.join(' ')).toContain('Netflix');
    expect(subs.json.answer.engine).toBe('rules');
    const afford = await t.call('POST', '/v1/si/ask', { text: 'Can I afford ₹30,000?' });
    expect(afford.json.answer.text).toMatch(/^(Yes|It's tight|Not comfortably)/);
    const goals = await t.call('POST', '/v1/si/ask', { text: 'Am I on track for my goals?' });
    expect(goals.json.answer.text).toContain("on track");
    const si = await t.call('GET', '/v1/si');
    expect(si.json.messages).toHaveLength(6);

    const notifications = await t.call('GET', '/v1/notifications');
    expect(notifications.json.notifications.length).toBeGreaterThan(0);

    // Revoking consent removes the shared data.
    const revoked = await t.call('POST', `/v1/aa/consents/${consent.json.id}/revoke`);
    expect(revoked.json.status).toBe('REVOKED');
    const homeAfter: HomeDTO = (await t.call('GET', '/v1/home')).json;
    expect(homeAfter.sync.health).toBe('NO_DATA');
    expect(homeAfter.balance.total).toBe(0);
    expect((await t.call('GET', '/v1/transactions')).json.total).toBe(0);

    // Account deletion.
    expect((await t.call('DELETE', '/v1/me')).json.ok).toBe(true);
    expect((await t.call('GET', '/v1/me')).status).toBe(401);
  });

  it('handles consent rejection and allows retry without losing setup', async () => {
    const t = await setup();
    await signIn(t, '9123456780');
    await t.call('POST', '/v1/aa/discovery');
    const disc = await waitFor(() => t.call('GET', '/v1/aa/discovery'), (r) => r.json.job && r.json.job.status !== 'RUNNING');
    const ids = disc.json.accounts.filter((a: any) => a.group === 'BANK').slice(0, 2).map((a: any) => a.id);
    const c1 = await t.call('POST', '/v1/aa/consents', { accountIds: ids });
    await t.call('POST', `/v1/sandbox/consents/${c1.json.approvalUrl.replace('sandbox:', '')}/reject`);
    expect((await t.call('GET', `/v1/aa/consents/${c1.json.id}`)).json.status).toBe('REJECTED');
    expect((await t.call('GET', '/v1/me')).json.onboardingState).toBe('CONSENT_REJECTED');
    const c2 = await t.call('POST', '/v1/aa/consents', { accountIds: ids });
    await t.call('POST', `/v1/sandbox/consents/${c2.json.approvalUrl.replace('sandbox:', '')}/approve`);
    await waitFor(() => t.call('GET', '/v1/sync/latest'), (r) => r.json.job && r.json.job.status !== 'RUNNING');
    expect((await t.call('GET', '/v1/me')).json.onboardingState).toBe('READY');
    const home: HomeDTO = (await t.call('GET', '/v1/home')).json;
    expect(home.balance.accountCount).toBe(2);
  });

  it('labels a partial picture when an FIP fails', async () => {
    const t = await setup({ MOCK_AA_FAIL_FIPS: 'sbi' });
    await signIn(t, '9988776655');
    const { sync } = await onboard(t, (a) => a.group === 'BANK');
    expect(sync.json.job.status).toBe('PARTIAL');
    const home: HomeDTO = (await t.call('GET', '/v1/home')).json;
    expect(home.sync.health).toBe('PARTIAL');
    expect(home.balance.accountCount).toBe(4);
    const accounts = await t.call('GET', '/v1/accounts');
    expect(accounts.json.accounts.find((a: any) => a.fip.id === 'sbi').syncStatus).toBe('FAILED');
  });

  it('rejects unsigned AA webhooks', async () => {
    const t = await setup();
    const body = JSON.stringify({ type: 'CONSENT_STATUS', providerConsentId: 'x', status: 'ACTIVE' });
    const bad = await t.app.request('/v1/webhooks/aa', { method: 'POST', body, headers: { 'x-signature': 'nope' } });
    expect(bad.status).toBe(401);
    const good = await t.app.request('/v1/webhooks/aa', { method: 'POST', body, headers: { 'x-signature': hmacHex('change-me', body) } });
    expect(good.status).toBe(200);
  });
});
