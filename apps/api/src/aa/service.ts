import {
  addMonthsToKey,
  formatDate,
  formatINR,
  forecastContext,
  isDepositAccount,
  istMonthKey,
  monthStartISO,
  titleCase,
  topInsight,
  upcomingPayments,
  type ConsentDTO,
  type ConsentPreviewDTO,
  type DiscoveryResponse,
  type JobDTO,
} from '@moneymate/core';
import { nowISO, type AppContext } from '../context';
import { badRequest, conflict, notFound } from '../lib/errors';
import { getAccount, listAccounts, toDiscoveredDTO, upsertDiscoveredAccount, type AccountRow } from '../repo/accounts';
import {
  activeConsents,
  consentEvent,
  dataSharedFor,
  getConsent,
  getConsentByProviderId,
  insertConsent,
  listConsents,
  setConsentStatus,
  toConsentDTO,
  type ConsentRow,
} from '../repo/consents';
import { createJob, finishJob, getJob, latestJob, setStep } from '../repo/jobs';
import { deleteHoldingsForAccounts, notify, saveHolding, saveNavs } from '../repo/misc';
import { deleteTxnsForAccounts, insertTxns, loadUserRules } from '../repo/txns';
import { audit, bumpDataVersion, getUser, setOnboardingState, updateProfile, userName, userPhone } from '../repo/users';
import { normalizeDeposit, normalizeEPF, normalizeMutualFunds, normalizeTermDeposit } from '../ingest/normalize';
import { financialState, recompute } from '../services/finance';
import { FI_TYPE_FOR, fip } from './fips';
import type { AANotification, CreateConsentInput, DataSessionResult, FIPayload } from './provider';

const HISTORY_MONTHS = 12;
const CONSENT_YEARS = 1;
/** Sahamati purpose code 102 — "Customer spending patterns, budget or other reportings". Re-verify with the AA partner. */
const PURPOSE = { code: '102', text: 'Understand your income and spending, and give you financial insights' };

const running = new Set<string>();

// ── Discovery ────────────────────────────────────────────────────────
const DISCOVERY_STEPS = [
  { key: 'banks', label: 'Checking banks' },
  { key: 'investments', label: 'Finding investments' },
  { key: 'other', label: 'Looking for other accounts' },
];

export function startDiscovery(ctx: AppContext, userId: string): JobDTO {
  const user = getUser(ctx, userId)!;
  if (!ctx.aa.discover) throw badRequest('Account discovery happens in your Account Aggregator app with this provider.', 'DISCOVERY_UNSUPPORTED');
  const job = createJob(ctx, userId, 'DISCOVERY', DISCOVERY_STEPS);
  if (user.onboarding_state !== 'READY') setOnboardingState(ctx, userId, 'DISCOVERING');
  void runDiscovery(ctx, userId, job.id, userPhone(ctx, user));
  return job;
}

async function runDiscovery(ctx: AppContext, userId: string, jobId: string, phone: string): Promise<void> {
  try {
    setStep(ctx, jobId, 'banks', 'RUNNING');
    const found = await ctx.aa.discover!({ phone });
    const banks = found.filter((a) => isDepositAccount(a.type));
    const investments = found.filter((a) => a.type === 'MUTUAL_FUNDS' || a.type === 'TERM_DEPOSIT');
    const other = found.filter((a) => !banks.includes(a) && !investments.includes(a));
    for (const a of banks) upsertDiscoveredAccount(ctx, userId, a);
    setStep(ctx, jobId, 'banks', 'DONE');
    setStep(ctx, jobId, 'investments', 'RUNNING');
    for (const a of investments) upsertDiscoveredAccount(ctx, userId, a);
    setStep(ctx, jobId, 'investments', 'DONE');
    setStep(ctx, jobId, 'other', 'RUNNING');
    for (const a of other) upsertDiscoveredAccount(ctx, userId, a);
    setStep(ctx, jobId, 'other', 'DONE');
    finishJob(ctx, jobId, 'COMPLETED');
    const user = getUser(ctx, userId)!;
    if (user.onboarding_state === 'DISCOVERING') setOnboardingState(ctx, userId, 'ACCOUNTS_FOUND');
    audit(ctx, userId, 'ACCOUNTS_DISCOVERED', { count: found.length });
  } catch (e) {
    ctx.log('error', 'discovery failed', { error: String(e) });
    finishJob(ctx, jobId, 'FAILED', 'We could not reach the Account Aggregator. Please try again.');
    const user = getUser(ctx, userId)!;
    if (user.onboarding_state === 'DISCOVERING') setOnboardingState(ctx, userId, 'PHONE_VERIFIED');
  }
}

export function discoveryState(ctx: AppContext, userId: string): DiscoveryResponse {
  const job = latestJob(ctx, userId, 'DISCOVERY') ?? null;
  return { job, accounts: listAccounts(ctx, userId).map(toDiscoveredDTO) };
}

// ── Consent ──────────────────────────────────────────────────────────
function consentWindow(ctx: AppContext) {
  const now = nowISO(ctx);
  const dataFrom = monthStartISO(addMonthsToKey(istMonthKey(now), -HISTORY_MONTHS));
  const expires = new Date(ctx.now());
  expires.setUTCFullYear(expires.getUTCFullYear() + CONSENT_YEARS);
  return { now, dataFrom, expiresAt: expires.toISOString() };
}

function selectAccounts(ctx: AppContext, userId: string, accountIds: string[]): AccountRow[] {
  if (!accountIds.length) throw badRequest('Select at least one account.', 'NO_ACCOUNTS');
  return accountIds.map((id) => {
    const a = getAccount(ctx, userId, id);
    if (!a) throw notFound('Account not found.');
    return a;
  });
}

export function consentPreview(ctx: AppContext, userId: string, accountIds: string[]): ConsentPreviewDTO {
  const accounts = selectAccounts(ctx, userId, accountIds);
  const fips = [...new Map(accounts.map((a) => [a.fip_id, fip(a.fip_id)])).values()];
  const fiTypes = [...new Set(accounts.map((a) => FI_TYPE_FOR[a.type]))];
  const title = fips.length === 1 ? `Connect ${fips[0]!.name}` : fips.length === 2 ? `Connect ${fips[0]!.shortName} & ${fips[1]!.shortName}` : `Connect ${accounts.length} accounts`;
  return {
    title,
    fips,
    dataShared: dataSharedFor(fiTypes, HISTORY_MONTHS),
    purpose: PURPOSE.text,
    dataRangeLabel: `Last ${HISTORY_MONTHS} months`,
    durationLabel: `${CONSENT_YEARS} year`,
    frequencyLabel: 'Refreshed up to once a day',
    provider: ctx.aa.name === 'mock' ? 'Account Aggregator (sandbox)' : 'Account Aggregator',
  };
}

export async function createConsent(ctx: AppContext, userId: string, accountIds: string[]): Promise<ConsentDTO> {
  const user = getUser(ctx, userId)!;
  const accounts = selectAccounts(ctx, userId, accountIds);
  const { now, dataFrom, expiresAt } = consentWindow(ctx);
  const fiTypes = [...new Set(accounts.map((a) => FI_TYPE_FOR[a.type]))];
  const input: CreateConsentInput = {
    phone: userPhone(ctx, user),
    accounts: accounts.map((a) => ({ providerRef: a.provider_ref, fipId: a.fip_id, type: a.type, maskedNumber: a.masked_number })),
    purposeCode: PURPOSE.code,
    purposeText: PURPOSE.text,
    fiTypes,
    dataFrom,
    dataTo: expiresAt,
    expiresAt,
    fetchType: 'PERIODIC',
    frequency: { unit: 'DAY', value: 1 },
  };
  const { providerConsentId, approvalUrl } = await ctx.aa.createConsent(input);
  const row = insertConsent(ctx, {
    user_id: userId,
    provider: ctx.aa.name,
    provider_consent_id: providerConsentId,
    status: 'PENDING',
    purpose_code: PURPOSE.code,
    purpose: PURPOSE.text,
    fi_types: JSON.stringify(fiTypes),
    data_from: dataFrom,
    data_to: now,
    expires_at: expiresAt,
    fetch_type: 'PERIODIC',
    frequency: 'Up to once a day',
    account_ids: JSON.stringify(accounts.map((a) => a.id)),
    approval_url: approvalUrl,
  });
  if (user.onboarding_state !== 'READY') setOnboardingState(ctx, userId, 'CONSENT_PENDING');
  audit(ctx, userId, 'CONSENT_REQUESTED', { consentId: row.id, accounts: accounts.length });
  return toConsentDTO(row, listAccounts(ctx, userId));
}

export function consentDTO(ctx: AppContext, userId: string, consentId: string): ConsentDTO {
  const row = getConsent(ctx, userId, consentId);
  if (!row) throw notFound('Consent not found.');
  return toConsentDTO(row, listAccounts(ctx, userId));
}

export function listConsentDTOs(ctx: AppContext, userId: string): ConsentDTO[] {
  const accounts = listAccounts(ctx, userId);
  return listConsents(ctx, userId).map((c) => toConsentDTO(c, accounts));
}

/** Rebuilds provider-side state for the sandbox provider after a restart. */
function ensureProviderConsent(ctx: AppContext, consent: ConsentRow): void {
  if (!ctx.mockAA || ctx.mockAA.hasConsent(consent.provider_consent_id)) return;
  const user = getUser(ctx, consent.user_id)!;
  const ids: string[] = JSON.parse(consent.account_ids);
  const accounts = ids.map((id) => getAccount(ctx, consent.user_id, id)).filter(Boolean) as AccountRow[];
  ctx.mockAA.restoreConsent(
    consent.provider_consent_id,
    {
      phone: userPhone(ctx, user),
      accounts: accounts.map((a) => ({ providerRef: a.provider_ref, fipId: a.fip_id, type: a.type, maskedNumber: a.masked_number })),
      purposeCode: consent.purpose_code,
      purposeText: consent.purpose,
      fiTypes: JSON.parse(consent.fi_types),
      dataFrom: consent.data_from,
      dataTo: consent.expires_at,
      expiresAt: consent.expires_at,
      fetchType: consent.fetch_type,
      frequency: { unit: 'DAY', value: 1 },
    },
    consent.status,
  );
}

export function consentForSandbox(ctx: AppContext, userId: string, providerConsentId: string): ConsentRow {
  const consent = getConsentByProviderId(ctx, providerConsentId);
  if (!consent || consent.user_id !== userId) throw notFound('Consent request not found.');
  ensureProviderConsent(ctx, consent);
  return consent;
}

/** Handles consent/data notifications from the AA (webhook or sandbox). Idempotent. */
export async function handleNotification(ctx: AppContext, n: AANotification): Promise<void> {
  if (n.type !== 'CONSENT_STATUS') return;
  const consent = getConsentByProviderId(ctx, n.providerConsentId);
  if (!consent || consent.status === n.status) return;
  setConsentStatus(ctx, consent, n.status, { source: 'notification' });
  const userId = consent.user_id;
  const user = getUser(ctx, userId)!;
  if (n.status === 'ACTIVE') {
    const ids: string[] = JSON.parse(consent.account_ids);
    for (const id of ids) {
      ctx.db.run("UPDATE accounts SET linked = 1, consent_id = ?, sync_status = 'PENDING', updated_at = ? WHERE user_id = ? AND id = ?", consent.id, nowISO(ctx), userId, id);
    }
    bumpDataVersion(ctx, userId);
    notify(ctx, userId, { kind: 'CONSENT', title: 'Accounts connected', body: `You approved sharing for ${ids.length} account${ids.length === 1 ? '' : 's'}. You can revoke this anytime.`, link: '/accounts', dedupeKey: `consent-active:${consent.id}` });
    if (user.onboarding_state !== 'READY') setOnboardingState(ctx, userId, 'SYNCING');
    startSync(ctx, userId);
  } else if (n.status === 'REJECTED') {
    if (user.onboarding_state !== 'READY') setOnboardingState(ctx, userId, 'CONSENT_REJECTED');
    notify(ctx, userId, { kind: 'CONSENT', title: 'Consent not approved', body: 'No data was shared. You can try again whenever you are ready.', link: '/accounts', dedupeKey: `consent-rejected:${consent.id}` });
  } else if (n.status === 'REVOKED' || n.status === 'EXPIRED') {
    removeConsentData(ctx, consent);
  }
}

function removeConsentData(ctx: AppContext, consent: ConsentRow): void {
  const ids: string[] = JSON.parse(consent.account_ids);
  // Keep only accounts not covered by another active consent.
  const stillCovered = new Set(
    activeConsents(ctx, consent.user_id)
      .filter((c) => c.id !== consent.id)
      .flatMap((c) => JSON.parse(c.account_ids) as string[]),
  );
  const toRemove = ids.filter((id) => !stillCovered.has(id));
  deleteTxnsForAccounts(ctx, consent.user_id, toRemove);
  deleteHoldingsForAccounts(ctx, consent.user_id, toRemove);
  for (const id of toRemove) {
    ctx.db.run("UPDATE accounts SET linked = 0, consent_id = NULL, current_balance = 0, sync_status = 'PENDING', last_synced_at = NULL, updated_at = ? WHERE user_id = ? AND id = ?", nowISO(ctx), consent.user_id, id);
  }
  consentEvent(ctx, consent.id, consent.user_id, 'DATA_DELETED', { accounts: toRemove.length });
  recompute(ctx, consent.user_id);
}

export async function revokeConsent(ctx: AppContext, userId: string, consentId: string): Promise<ConsentDTO> {
  const consent = getConsent(ctx, userId, consentId);
  if (!consent) throw notFound('Consent not found.');
  if (consent.status === 'REVOKED') return toConsentDTO(consent, listAccounts(ctx, userId));
  if (consent.status === 'ACTIVE' || consent.status === 'PENDING' || consent.status === 'PAUSED') {
    ensureProviderConsent(ctx, consent);
    await ctx.aa.revokeConsent(consent.provider_consent_id);
  }
  setConsentStatus(ctx, consent, 'REVOKED', { source: 'user' });
  removeConsentData(ctx, consent);
  audit(ctx, userId, 'CONSENT_REVOKED', { consentId });
  notify(ctx, userId, { kind: 'CONSENT', title: 'Consent revoked', body: 'Data sharing stopped and the related data was removed from MoneyMate.', link: '/accounts', dedupeKey: `consent-revoked:${consent.id}` });
  return toConsentDTO(getConsent(ctx, userId, consentId)!, listAccounts(ctx, userId));
}

// ── Sync ─────────────────────────────────────────────────────────────
export const SYNC_STEPS = [
  { key: 'fetch', label: 'Fetching bank data' },
  { key: 'normalize', label: 'Understanding transactions' },
  { key: 'categorize', label: 'Categorizing expenses' },
  { key: 'recurring', label: 'Finding recurring payments' },
  { key: 'investments', label: 'Identifying investments' },
  { key: 'profile', label: 'Building your financial profile' },
];

export function startSync(ctx: AppContext, userId: string): JobDTO {
  const latest = latestJob(ctx, userId, 'SYNC');
  if (running.has(userId) && latest && latest.status === 'RUNNING') return latest;
  if (activeConsents(ctx, userId).length === 0) throw conflict('Connect an account before syncing.', 'NO_ACTIVE_CONSENT');
  const job = createJob(ctx, userId, 'SYNC', SYNC_STEPS);
  running.add(userId);
  void runSync(ctx, userId, job.id).finally(() => running.delete(userId));
  return job;
}

export function syncJob(ctx: AppContext, userId: string, jobId?: string): JobDTO | undefined {
  return jobId ? getJob(ctx, userId, jobId) : latestJob(ctx, userId, 'SYNC');
}

async function pollSession(ctx: AppContext, providerSessionId: string): Promise<DataSessionResult> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const r = await ctx.aa.fetchData(providerSessionId);
    if (r.status !== 'PENDING') return r;
    if (Date.now() > deadline) return { status: 'FAILED', accounts: [], failures: [{ providerRef: '*', reason: 'Timed out waiting for data' }] };
    await new Promise((res) => setTimeout(res, 300));
  }
}

async function runSync(ctx: AppContext, userId: string, jobId: string): Promise<void> {
  const user = getUser(ctx, userId)!;
  try {
    // 1. Fetch FI data for every active consent.
    setStep(ctx, jobId, 'fetch', 'RUNNING');
    const payloads: FIPayload[] = [];
    const failures: DataSessionResult['failures'] = [];
    for (const consent of activeConsents(ctx, userId)) {
      ensureProviderConsent(ctx, consent);
      const to = nowISO(ctx);
      const { providerSessionId } = await ctx.aa.createDataSession({ providerConsentId: consent.provider_consent_id, from: consent.data_from, to });
      const sessionId = `ds_${providerSessionId}`;
      ctx.db.run(
        'INSERT INTO data_sessions (id, user_id, consent_id, provider_session_id, status, data_from, data_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sessionId, userId, consent.id, providerSessionId, 'PENDING', consent.data_from, to, nowISO(ctx),
      );
      const result = await pollSession(ctx, providerSessionId);
      ctx.db.run('UPDATE data_sessions SET status = ?, completed_at = ?, error = ? WHERE id = ?', result.status, nowISO(ctx), result.failures.length ? JSON.stringify(result.failures) : null, sessionId);
      consentEvent(ctx, consent.id, userId, 'DATA_FETCHED', { status: result.status, accounts: result.accounts.length, failures: result.failures.length });
      payloads.push(...result.accounts);
      failures.push(...result.failures);
      ctx.db.run('UPDATE consents SET data_to = ?, updated_at = ? WHERE id = ?', to, nowISO(ctx), consent.id);
    }
    if (payloads.length === 0) throw new Error(failures[0]?.reason ?? 'No data received');
    setStep(ctx, jobId, 'fetch', 'DONE');

    // 2. Normalise + dedupe deposits.
    setStep(ctx, jobId, 'normalize', 'RUNNING');
    const accounts = listAccounts(ctx, userId);
    const byRef = new Map(accounts.map((a) => [a.provider_ref, a]));
    const failedRefs = new Set(failures.map((f) => f.providerRef));
    const holderNames: string[] = [];
    const rules = loadUserRules(ctx, userId);
    const now = nowISO(ctx);
    for (const p of payloads) {
      const acc = byRef.get(p.providerRef);
      if (!acc) continue;
      holderNames.push(p.holderName);
      if (p.kind === 'DEPOSIT') {
        const n = normalizeDeposit(p, acc.id, {
          ownAccountLast4: accounts.map((a) => a.masked_number.slice(-4)),
          ownNames: [p.holderName.toLowerCase()],
          userRules: rules,
        });
        insertTxns(ctx, userId, n.txns);
        ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', holder_name_enc = ?, updated_at = ? WHERE id = ?", n.currentBalance, n.balanceAsOf, now, ctx.vault.encrypt(p.holderName), now, acc.id);
        if (n.rejected) ctx.log('warn', 'rejected malformed transactions', { account: acc.id, rejected: n.rejected });
      }
    }
    for (const ref of failedRefs) {
      const acc = byRef.get(ref);
      if (acc) ctx.db.run("UPDATE accounts SET sync_status = 'FAILED', updated_at = ? WHERE id = ?", now, acc.id);
    }
    setStep(ctx, jobId, 'normalize', 'DONE');

    // 3. Categorise (rules + engine passes) and 4. recurring detection (both inside recompute).
    setStep(ctx, jobId, 'categorize', 'RUNNING');
    if (holderNames[0] && !userName(ctx, user)) updateProfile(ctx, userId, { name: titleCase(holderNames[0]) });
    recompute(ctx, userId);
    setStep(ctx, jobId, 'categorize', 'DONE');
    setStep(ctx, jobId, 'recurring', 'RUNNING');
    setStep(ctx, jobId, 'recurring', 'DONE');

    // 5. Investments.
    setStep(ctx, jobId, 'investments', 'RUNNING');
    for (const p of payloads) {
      const acc = byRef.get(p.providerRef);
      if (!acc) continue;
      if (p.kind === 'MUTUAL_FUNDS') {
        const { holdings, value } = normalizeMutualFunds(p, acc.id);
        saveHolding(ctx, userId, acc.id, 'MUTUAL_FUNDS', holdings);
        for (const h of holdings) {
          const first = h.transactions.reduce((m, t) => (Date.parse(t.date) < Date.parse(m) ? t.date : m), now);
          saveNavs(ctx, h.schemeCode, await ctx.market.navHistory(h.schemeCode, first, now));
        }
        ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', updated_at = ? WHERE id = ?", value, now, now, now, acc.id);
      } else if (p.kind === 'TERM_DEPOSIT') {
        const fd = normalizeTermDeposit(p, acc.id);
        saveHolding(ctx, userId, acc.id, 'TERM_DEPOSIT', fd);
        ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', updated_at = ? WHERE id = ?", fd.currentValue, now, now, now, acc.id);
      } else if (p.kind === 'EPF') {
        const epf = normalizeEPF(p, acc.id);
        saveHolding(ctx, userId, acc.id, 'EPF', epf);
        ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', updated_at = ? WHERE id = ?", epf.balance, now, now, now, acc.id);
      }
    }
    bumpDataVersion(ctx, userId);
    setStep(ctx, jobId, 'investments', 'DONE');

    // 6. Profile: notifications, first brief, onboarding complete.
    setStep(ctx, jobId, 'profile', 'RUNNING');
    generateNotifications(ctx, userId);
    setStep(ctx, jobId, 'profile', 'DONE');
    const partial = failures.length > 0;
    finishJob(ctx, jobId, partial ? 'PARTIAL' : 'COMPLETED', partial ? `${failures.length} account${failures.length === 1 ? '' : 's'} could not be synced.` : null);
    if (partial) {
      notify(ctx, userId, { kind: 'SYNC', title: 'Some accounts did not sync', body: 'Your picture is incomplete. Retry from Accounts.', link: '/accounts', dedupeKey: `sync-partial:${jobId}` });
    }
    if (getUser(ctx, userId)!.onboarding_state !== 'READY') setOnboardingState(ctx, userId, 'READY');
    audit(ctx, userId, 'SYNC_COMPLETED', { partial, failures: failures.length });
  } catch (e) {
    ctx.log('error', 'sync failed', { error: String(e) });
    finishJob(ctx, jobId, 'FAILED', 'We could not fetch your data right now. Please retry.');
    const u = getUser(ctx, userId)!;
    if (u.onboarding_state === 'SYNCING') setOnboardingState(ctx, userId, 'SYNC_FAILED');
    notify(ctx, userId, { kind: 'SYNC', title: 'Sync failed', body: 'We could not fetch your data. Tap to retry.', link: '/accounts', dedupeKey: `sync-failed:${jobId}` });
  }
}

/** Upcoming payment reminders (next 3 days) and the current SI observation. Deduplicated. */
export function generateNotifications(ctx: AppContext, userId: string): void {
  const state = financialState(ctx, userId);
  const fctx = forecastContext(state);
  for (const u of upcomingPayments(fctx.recurring, state.now, 3)) {
    notify(ctx, userId, {
      kind: 'UPCOMING_PAYMENT',
      title: `${u.merchantName} due ${formatDate(u.dueDate)}`,
      body: `${formatINR(u.amount, { decimals: 0 })} is expected based on your past payments.`,
      link: '/upcoming',
      dedupeKey: `upcoming:${u.seriesKey}:${u.dueDateKey}`,
    });
  }
  const insight = topInsight(state, fctx);
  if (insight) {
    notify(ctx, userId, { kind: 'INSIGHT', title: insight.title, body: insight.body, link: '/si', dedupeKey: `insight:${insight.id}` });
  }
}
