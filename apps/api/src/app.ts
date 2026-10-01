import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  CATEGORY_IDS,
  defaultCategoryForType,
  isTypeAllowed,
  TXN_TYPES,
  type ActivityFilter,
  type CategoryId,
  type TxnType,
} from '@moneymate/core';
import type { AppContext } from './context';
import { badRequest, HttpError, notFound } from './lib/errors';
import { hmacHex, safeEqual } from './lib/crypto';
import { authenticate, listSessions, requestOtp, revokeSession, verifyOtp, type AuthedSession } from './auth/service';
import {
  consentDTO,
  consentForSandbox,
  consentPreview,
  createConsent,
  discoveryState,
  generateNotifications,
  handleNotification,
  listConsentDTOs,
  revokeConsent,
  startDiscovery,
  startSync,
  syncJob,
} from './aa/service';
import { fip } from './aa/fips';
import { listAccounts, toAccountDTO, toEngineAccount } from './repo/accounts';
import { getConsent } from './repo/consents';
import { getJob } from './repo/jobs';
import {
  ASSUMPTION_KEYS,
  clearConversation,
  createGoal,
  deleteBudget,
  deleteGoal,
  getGoal,
  getOrCreateConversation,
  listNotifications,
  markRead,
  setAssumption,
  updateGoal,
  upsertBudget,
} from './repo/misc';
import { getTxn, saveUserRule, setMerchantRecurring, updateTxnUserFields } from './repo/txns';
import { audit, bumpDataVersion, getUser, toMeDTO, updateProfile } from './repo/users';
import { financialState, invalidate, recompute } from './services/finance';
import { activityDTO, budgetsDTO, forecastDTO, homeDTO, planDTO, toTxnDTO, upcomingDTO, wealthDTO } from './services/views';
import { ask, siHome } from './si/service';
import { forecastContext, projectGoal, reconcile } from '@moneymate/core';

type Env = { Variables: { auth: AuthedSession } };

const money = z.number().int().min(0).max(1_000_000_000_00);
const isoDate = z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Invalid date');

async function parse<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown = {};
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 'VALIDATION');
  return r.data;
}

export function createApp(ctx: AppContext): Hono<Env> {
  const app = new Hono<Env>();
  ctx.aa.onNotification((n) => handleNotification(ctx, n));

  app.use('*', secureHeaders());
  const origins = ctx.config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use('*', cors({ origin: origins.length ? origins : '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.retryAfterSeconds) c.header('Retry-After', String(err.retryAfterSeconds));
      return c.json({ error: { code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds } }, err.status as 400);
    }
    ctx.log('error', 'unhandled error', { error: String(err), stack: (err as Error).stack });
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));

  app.get('/health', (c) => c.json({ ok: true, aa: ctx.aa.name, sms: ctx.sms.name, si: ctx.llm ? 'llm' : 'rules' }));

  // ── Auth (public) ──────────────────────────────────────────────────
  const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  app.post('/v1/auth/otp', async (c) => {
    const body = await parse(c, z.object({ phone: z.string().min(10).max(20) }));
    return c.json(await requestOtp(ctx, body.phone, clientIp(c)));
  });
  app.post('/v1/auth/verify', async (c) => {
    const body = await parse(c, z.object({ challengeId: z.string(), code: z.string(), deviceName: z.string().max(80).optional(), platform: z.string().max(20).optional() }));
    return c.json(await verifyOtp(ctx, body));
  });

  // ── AA webhook (public, signed) ────────────────────────────────────
  app.post('/v1/webhooks/aa', async (c) => {
    const raw = await c.req.text();
    const sig = c.req.header('x-signature') ?? '';
    if (!safeEqual(sig, hmacHex(ctx.config.AA_WEBHOOK_SECRET, raw))) throw new HttpError(401, 'BAD_SIGNATURE', 'Invalid signature.');
    const body = z
      .object({ type: z.literal('CONSENT_STATUS'), providerConsentId: z.string(), status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED', 'PAUSED', 'FAILED']) })
      .safeParse(JSON.parse(raw || '{}'));
    if (!body.success) throw badRequest('Unsupported notification.');
    await handleNotification(ctx, body.data);
    return c.json({ ok: true });
  });

  // ── Everything below requires a session ────────────────────────────
  app.use('/v1/*', async (c, next) => {
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    c.set('auth', authenticate(ctx, token));
    await next();
  });
  const uid = (c: Context<Env>) => c.get('auth').user.id;

  app.get('/v1/me', (c) => c.json(toMeDTO(ctx, getUser(ctx, uid(c))!)));
  app.patch('/v1/me', async (c) => {
    const body = await parse(c, z.object({ name: z.string().min(1).max(60).nullable().optional(), themePreference: z.enum(['system', 'light', 'dark']).optional() }));
    updateProfile(ctx, uid(c), body);
    bumpDataVersion(ctx, uid(c));
    return c.json(toMeDTO(ctx, getUser(ctx, uid(c))!));
  });
  app.post('/v1/auth/logout', (c) => {
    revokeSession(ctx, uid(c), c.get('auth').sessionId);
    return c.json({ ok: true });
  });
  app.get('/v1/me/sessions', (c) => c.json({ sessions: listSessions(ctx, uid(c), c.get('auth').sessionId) }));
  app.delete('/v1/me/sessions/:id', (c) => {
    if (!revokeSession(ctx, uid(c), c.req.param('id'))) throw notFound('Session not found.');
    audit(ctx, uid(c), 'SESSION_REVOKED', { sessionId: c.req.param('id') });
    return c.json({ ok: true });
  });
  /** Deletes the account and all financial data after revoking every consent (Blueprint §23). */
  app.delete('/v1/me', async (c) => {
    const userId = uid(c);
    for (const consent of listConsentDTOs(ctx, userId)) {
      if (consent.status === 'ACTIVE' || consent.status === 'PENDING') await revokeConsent(ctx, userId, consent.id);
    }
    audit(ctx, userId, 'ACCOUNT_DELETED');
    ctx.db.run('DELETE FROM users WHERE id = ?', userId);
    invalidate(userId);
    return c.json({ ok: true });
  });

  // ── Onboarding / AA ────────────────────────────────────────────────
  app.post('/v1/aa/discovery', (c) => c.json({ job: startDiscovery(ctx, uid(c)) }));
  app.get('/v1/aa/discovery', (c) => {
    const d = discoveryState(ctx, uid(c));
    if (!d) throw notFound('Discovery has not started.');
    return c.json(d);
  });
  app.post('/v1/aa/consent-preview', async (c) => {
    const body = await parse(c, z.object({ accountIds: z.array(z.string()).min(1).max(20) }));
    return c.json(consentPreview(ctx, uid(c), body.accountIds));
  });
  app.post('/v1/aa/consents', async (c) => {
    const body = await parse(c, z.object({ accountIds: z.array(z.string()).min(1).max(20) }));
    return c.json(await createConsent(ctx, uid(c), body.accountIds));
  });
  app.get('/v1/aa/consents', (c) => c.json({ consents: listConsentDTOs(ctx, uid(c)) }));
  app.get('/v1/aa/consents/:id', (c) => c.json(consentDTO(ctx, uid(c), c.req.param('id'))));
  app.post('/v1/aa/consents/:id/revoke', async (c) => c.json(await revokeConsent(ctx, uid(c), c.req.param('id'))));
  app.get('/v1/jobs/:id', (c) => {
    const job = getJob(ctx, uid(c), c.req.param('id'));
    if (!job) throw notFound('Job not found.');
    return c.json(job);
  });
  app.post('/v1/sync', (c) => c.json(startSync(ctx, uid(c))));
  app.get('/v1/sync/latest', (c) => c.json({ job: syncJob(ctx, uid(c)) ?? null }));

  // Sandbox approval (stands in for the AA partner's hosted consent page).
  app.get('/v1/sandbox/consents/:providerConsentId', (c) => {
    if (!ctx.mockAA) throw notFound();
    const consent = consentForSandbox(ctx, uid(c), c.req.param('providerConsentId'));
    const d = ctx.mockAA.describeConsent(consent.provider_consent_id);
    return c.json({
      consentId: consent.id,
      status: d.status,
      purpose: d.purposeText,
      accounts: d.accounts.map((a) => ({ fip: fip(a.fipId), maskedNumber: a.maskedNumber, type: a.type })),
      dataFrom: d.dataFrom,
      expiresAt: d.expiresAt,
    });
  });
  for (const action of ['approve', 'reject'] as const) {
    app.post(`/v1/sandbox/consents/:providerConsentId/${action}`, async (c) => {
      if (!ctx.mockAA) throw notFound();
      const consent = consentForSandbox(ctx, uid(c), c.req.param('providerConsentId'));
      try {
        if (action === 'approve') await ctx.mockAA.approve(consent.provider_consent_id);
        else await ctx.mockAA.reject(consent.provider_consent_id);
      } catch (e) {
        throw badRequest((e as Error).message, 'CONSENT_STATE');
      }
      return c.json(consentDTO(ctx, uid(c), consent.id));
    });
  }

  // ── Accounts ───────────────────────────────────────────────────────
  app.get('/v1/accounts', (c) => {
    const userId = uid(c);
    const order = { SAVINGS: 0, CURRENT: 0, TERM_DEPOSIT: 1, MUTUAL_FUNDS: 2, EPF: 3 } as const;
    const rows = listAccounts(ctx, userId)
      .filter((a) => a.linked === 1 || a.consent_id)
      .sort((a, b) => order[a.type] - order[b.type]);
    const state = financialState(ctx, userId);
    const txns = state.txns;
    const accounts = rows.map((r) => {
      const consent = r.consent_id ? getConsent(ctx, userId, r.consent_id) : undefined;
      const rec = r.type === 'SAVINGS' || r.type === 'CURRENT' ? reconcile(toEngineAccount(r), txns) : null;
      return toAccountDTO(r, consent?.status ?? null, rec ? { status: rec.status, difference: rec.difference } : null);
    });
    return c.json({
      accounts,
      totalCash: accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'CURRENT').reduce((s, a) => s + a.balance, 0),
      consents: listConsentDTOs(ctx, userId),
    });
  });

  // ── Home ───────────────────────────────────────────────────────────
  app.get('/v1/home', (c) => c.json(homeDTO(ctx, uid(c))));
  app.get('/v1/upcoming', (c) => c.json(upcomingDTO(ctx, uid(c), Math.min(Number(c.req.query('days') ?? 30) || 30, 90))));

  // ── Activity ───────────────────────────────────────────────────────
  app.get('/v1/transactions', (c) => {
    const q = c.req.query();
    const filter = (['all', 'expenses', 'income', 'investments', 'loans', 'transfers'] as const).includes(q.filter as ActivityFilter) ? (q.filter as ActivityFilter) : 'all';
    return c.json(
      activityDTO(ctx, uid(c), {
        filter,
        q: q.q,
        categoryId: (CATEGORY_IDS as readonly string[]).includes(q.categoryId ?? '') ? (q.categoryId as CategoryId) : undefined,
        accountId: q.accountId,
        month: q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : undefined,
        merchantKey: q.merchantKey,
        cursor: q.cursor,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    );
  });
  const txnDTO = (userId: string, id: string) => {
    const t = getTxn(ctx, userId, id);
    if (!t) throw notFound('Transaction not found.');
    const accounts = new Map(listAccounts(ctx, userId).map((a) => [a.id, a]));
    return toTxnDTO(t, accounts);
  };
  app.get('/v1/transactions/:id', (c) => c.json(txnDTO(uid(c), c.req.param('id'))));
  app.patch('/v1/transactions/:id', async (c) => {
    const userId = uid(c);
    const id = c.req.param('id');
    const body = await parse(
      c,
      z.object({
        categoryId: z.enum(CATEGORY_IDS).optional(),
        type: z.enum(TXN_TYPES).optional(),
        note: z.string().max(280).nullable().optional(),
        isRecurring: z.boolean().optional(),
        applyToMerchant: z.boolean().optional(),
      }),
    );
    const t = getTxn(ctx, userId, id);
    if (!t) throw notFound('Transaction not found.');
    if (body.type && !isTypeAllowed(body.type as TxnType, t.direction)) throw badRequest(`A ${t.direction === 'DEBIT' ? 'payment out' : 'payment in'} can't be marked as ${body.type}.`, 'INVALID_TYPE');
    const categoryId = body.categoryId ?? (body.type ? defaultCategoryForType(body.type as TxnType) ?? undefined : undefined);
    updateTxnUserFields(ctx, userId, id, { categoryId, type: body.type, note: body.note, isRecurring: body.isRecurring });
    if (body.isRecurring !== undefined) setMerchantRecurring(ctx, userId, t.merchantKey, body.isRecurring);
    if (body.applyToMerchant && (categoryId || body.type)) saveUserRule(ctx, userId, t.merchantKey, { categoryId, type: body.type });
    if (categoryId || body.type || body.isRecurring !== undefined || body.applyToMerchant) recompute(ctx, userId);
    else bumpDataVersion(ctx, userId);
    return c.json(txnDTO(userId, id));
  });
  app.put('/v1/transactions/:id/split', async (c) => {
    const userId = uid(c);
    const id = c.req.param('id');
    const t = getTxn(ctx, userId, id);
    if (!t) throw notFound('Transaction not found.');
    const body = await parse(
      c,
      z.object({
        parts: z
          .array(z.object({ amount: money.min(1), type: z.enum(TXN_TYPES), categoryId: z.enum(CATEGORY_IDS), counterparty: z.string().max(60).nullable().optional(), label: z.string().max(60).nullable().optional() }))
          .max(10),
      }),
    );
    if (body.parts.length === 1) throw badRequest('A split needs at least two parts.', 'SPLIT_PARTS');
    if (body.parts.length) {
      const total = body.parts.reduce((s, p) => s + p.amount, 0);
      if (total !== t.amount) throw badRequest('Split parts must add up to the transaction amount.', 'SPLIT_TOTAL');
      for (const p of body.parts) if (!isTypeAllowed(p.type as TxnType, t.direction)) throw badRequest(`Invalid type ${p.type} for this transaction.`, 'INVALID_TYPE');
    }
    updateTxnUserFields(ctx, userId, id, { splits: body.parts.length ? body.parts : null });
    bumpDataVersion(ctx, userId);
    return c.json(txnDTO(userId, id));
  });

  // ── Wealth ─────────────────────────────────────────────────────────
  app.get('/v1/wealth', (c) => c.json(wealthDTO(ctx, uid(c))));

  // ── Plan ───────────────────────────────────────────────────────────
  app.get('/v1/plan', (c) => c.json(planDTO(ctx, uid(c))));
  app.get('/v1/forecast', (c) => c.json(forecastDTO(ctx, uid(c))));
  app.put('/v1/assumptions', async (c) => {
    const body = await parse(c, z.partialRecord(z.enum(ASSUMPTION_KEYS), z.number().min(0).max(1e12).nullable()));
    for (const [k, v] of Object.entries(body)) {
      if ((k.endsWith('Pct') && v != null && v > 50)) throw badRequest(`${k} must be 50% or less.`);
      setAssumption(ctx, uid(c), k as (typeof ASSUMPTION_KEYS)[number], v == null ? null : k.endsWith('Pct') ? v : Math.round(v));
    }
    bumpDataVersion(ctx, uid(c));
    return c.json(planDTO(ctx, uid(c)));
  });
  const goalSchema = z.object({
    name: z.string().trim().min(1).max(40),
    emoji: z.string().max(8).optional(),
    targetAmount: money.min(100),
    targetDate: isoDate,
    currentAmount: money,
    monthlyContribution: money,
  });
  const goalDTO = (userId: string, id: string) => {
    const g = getGoal(ctx, userId, id);
    if (!g) throw notFound('Goal not found.');
    const state = financialState(ctx, userId);
    return { ...g, projection: projectGoal(g, state.now, forecastContext(state).assumptions.goalReturnPct) };
  };
  app.post('/v1/goals', async (c) => {
    const body = await parse(c, goalSchema);
    const g = createGoal(ctx, uid(c), body);
    bumpDataVersion(ctx, uid(c));
    return c.json(goalDTO(uid(c), g.id), 201);
  });
  app.get('/v1/goals/:id', (c) => c.json(goalDTO(uid(c), c.req.param('id'))));
  app.patch('/v1/goals/:id', async (c) => {
    const body = await parse(c, goalSchema.partial());
    if (!getGoal(ctx, uid(c), c.req.param('id'))) throw notFound('Goal not found.');
    updateGoal(ctx, uid(c), c.req.param('id'), body);
    bumpDataVersion(ctx, uid(c));
    return c.json(goalDTO(uid(c), c.req.param('id')));
  });
  app.delete('/v1/goals/:id', (c) => {
    if (!deleteGoal(ctx, uid(c), c.req.param('id'))) throw notFound('Goal not found.');
    bumpDataVersion(ctx, uid(c));
    return c.json({ ok: true });
  });
  app.get('/v1/budgets', (c) => c.json(budgetsDTO(ctx, uid(c))));
  app.put('/v1/budgets/:categoryId', async (c) => {
    const categoryId = z.enum(CATEGORY_IDS).safeParse(c.req.param('categoryId'));
    if (!categoryId.success) throw badRequest('Unknown category.');
    const body = await parse(c, z.object({ monthlyLimit: money.min(100) }));
    upsertBudget(ctx, uid(c), categoryId.data, body.monthlyLimit);
    bumpDataVersion(ctx, uid(c));
    return c.json(budgetsDTO(ctx, uid(c)));
  });
  app.delete('/v1/budgets/:categoryId', (c) => {
    const categoryId = z.enum(CATEGORY_IDS).safeParse(c.req.param('categoryId'));
    if (!categoryId.success) throw badRequest('Unknown category.');
    deleteBudget(ctx, uid(c), categoryId.data);
    bumpDataVersion(ctx, uid(c));
    return c.json(budgetsDTO(ctx, uid(c)));
  });

  // ── SI ─────────────────────────────────────────────────────────────
  app.get('/v1/si', (c) => c.json(siHome(ctx, uid(c))));
  app.post('/v1/si/ask', async (c) => {
    const body = await parse(c, z.object({ text: z.string().trim().min(1).max(500), conversationId: z.string().optional() }));
    return c.json(await ask(ctx, uid(c), body.text, body.conversationId));
  });
  app.post('/v1/si/clear', (c) => {
    clearConversation(ctx, uid(c), getOrCreateConversation(ctx, uid(c)));
    return c.json(siHome(ctx, uid(c)));
  });

  // ── Notifications ──────────────────────────────────────────────────
  app.get('/v1/notifications', (c) => {
    generateNotifications(ctx, uid(c));
    return c.json({ notifications: listNotifications(ctx, uid(c)) });
  });
  app.post('/v1/notifications/read', async (c) => {
    const body = await parse(c, z.object({ id: z.string().optional() }));
    markRead(ctx, uid(c), body.id);
    return c.json({ ok: true });
  });

  return app;
}
