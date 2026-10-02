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
} from '@finance-buddy/core';
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
/** A sync job older than this is treated as stuck (e.g. the server instance was recycled). */
const STALE_JOB_MS = 3 * 60 * 1000;

// ── Discovery ────────────────────────────────────────────────────────
const DISCOVERY_STEPS = [
  { key: 'banks', label: 'Checking banks' },
  { key: 'investments', label: 'Finding investments' },
  { key: 'other', label: 'Looking for other accounts' },
];

export async function startDiscovery(ctx: AppContext, userId: string): Promise<JobDTO> {
  const user = (await getUser(ctx, userId))!;
  if (!ctx.aa.discover) throw badRequest('Account discovery happens in your Account Aggregator app with this provider.', 'DISCOVERY_UNSUPPORTED');
  const job = await createJob(ctx, userId, 'DISCOVERY', DISCOVERY_STEPS);
  if (user.onboarding_state !== 'READY') await setOnboardingState(ctx, userId, 'DISCOVERING');
  ctx.background(runDiscovery(ctx, userId, job.id, userPhone(ctx, user)));
  return job;
}

async function runDiscovery(ctx: AppContext, userId: string, jobId: string, phone: string): Promise<void> {
  try {
    await setStep(ctx, jobId, 'banks', 'RUNNING');
    const found = await ctx.aa.discover!({ phone });
    const banks = found.filter((a) => isDepositAccount(a.type));
    const investments = found.filter((a) => a.type === 'MUTUAL_FUNDS' || a.type === 'TERM_DEPOSIT');
    const other = found.filter((a) => !banks.includes(a) && !investments.includes(a));
    for (const a of banks) await upsertDiscoveredAccount(ctx, userId, a);
    await setStep(ctx, jobId, 'banks', 'DONE');
    await setStep(ctx, jobId, 'investments', 'RUNNING');
    for (const a of investments) await upsertDiscoveredAccount(ctx, userId, a);
    await setStep(ctx, jobId, 'investments', 'DONE');
    await setStep(ctx, jobId, 'other', 'RUNNING');
    for (const a of other) await upsertDiscoveredAccount(ctx, userId, a);
    await setStep(ctx, jobId, 'other', 'DONE');
    await finishJob(ctx, jobId, 'COMPLETED');
    const user = (await getUser(ctx, userId))!;
    if (user.onboarding_state === 'DISCOVERING') await setOnboardingState(ctx, userId, 'ACCOUNTS_FOUND');
    await audit(ctx, userId, 'ACCOUNTS_DISCOVERED', { count: found.length });
  } catch (e) {
    ctx.log('error', 'discovery failed', { error: String(e) });
    await finishJob(ctx, jobId, 'FAILED', 'We could not reach the Account Aggregator. Please try again.');
    const user = await getUser(ctx, userId);
    if (user?.onboarding_state === 'DISCOVERING') await setOnboardingState(ctx, userId, 'PHONE_VERIFIED');
  }
}

export async function discoveryState(ctx: AppContext, userId: string): Promise<DiscoveryResponse> {
  const job = (await latestJob(ctx, userId, 'DISCOVERY')) ?? null;
  return { job, accounts: (await listAccounts(ctx, userId)).map(toDiscoveredDTO) };
}

// ── Consent ──────────────────────────────────────────────────────────
function consentWindow(ctx: AppContext) {
  const now = nowISO(ctx);
  const dataFrom = monthStartISO(addMonthsToKey(istMonthKey(now), -HISTORY_MONTHS));
  const expires = new Date(ctx.now());
  expires.setUTCFullYear(expires.getUTCFullYear() + CONSENT_YEARS);
  return { now, dataFrom, expiresAt: expires.toISOString() };
}

async function selectAccounts(ctx: AppContext, userId: string, accountIds: string[]): Promise<AccountRow[]> {
  if (!accountIds.length) throw badRequest('Select at least one account.', 'NO_ACCOUNTS');
  const out: AccountRow[] = [];
  for (const id of accountIds) {
    const a = await getAccount(ctx, userId, id);
    if (!a) throw notFound('Account not found.');
    out.push(a);
  }
  return out;
}

export async function consentPreview(ctx: AppContext, userId: string, accountIds: string[]): Promise<ConsentPreviewDTO> {
  const accounts = await selectAccounts(ctx, userId, accountIds);
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
    provider: 'Account Aggregator',
  };
}

export async function createConsent(ctx: AppContext, userId: string, accountIds: string[]): Promise<ConsentDTO> {
  const user = (await getUser(ctx, userId))!;
  const accounts = await selectAccounts(ctx, userId, accountIds);
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
  const row = await insertConsent(ctx, {
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
  if (user.onboarding_state !== 'READY') await setOnboardingState(ctx, userId, 'CONSENT_PENDING');
  await audit(ctx, userId, 'CONSENT_REQUESTED', { consentId: row.id, accounts: accounts.length });
  return toConsentDTO(row, await listAccounts(ctx, userId));
}

export async function consentDTO(ctx: AppContext, userId: string, consentId: string): Promise<ConsentDTO> {
  const row = await getConsent(ctx, userId, consentId);
  if (!row) throw notFound('Consent not found.');
  return toConsentDTO(row, await listAccounts(ctx, userId));
}

export async function listConsentDTOs(ctx: AppContext, userId: string): Promise<ConsentDTO[]> {
  const accounts = await listAccounts(ctx, userId);
  return (await listConsents(ctx, userId)).map((c) => toConsentDTO(c, accounts));
}

export async function consentForSandbox(ctx: AppContext, userId: string, providerConsentId: string): Promise<ConsentRow> {
  const consent = await getConsentByProviderId(ctx, providerConsentId);
  if (!consent || consent.user_id !== userId) throw notFound('Consent request not found.');
  return consent;
}

/** Handles consent/data notifications from the AA (webhook or sandbox). Idempotent. */
export async function handleNotification(ctx: AppContext, n: AANotification): Promise<void> {
  if (n.type !== 'CONSENT_STATUS') return;
  const consent = await getConsentByProviderId(ctx, n.providerConsentId);
  if (!consent || consent.status === n.status) return;
  await setConsentStatus(ctx, consent, n.status, { source: 'notification' });
  const userId = consent.user_id;
  const user = (await getUser(ctx, userId))!;
  if (n.status === 'ACTIVE') {
    const ids: string[] = JSON.parse(consent.account_ids);
    for (const id of ids) {
      await ctx.db.run("UPDATE accounts SET linked = 1, consent_id = ?, sync_status = 'PENDING', updated_at = ? WHERE user_id = ? AND id = ?", consent.id, nowISO(ctx), userId, id);
    }
    await bumpDataVersion(ctx, userId);
    await notify(ctx, userId, { kind: 'CONSENT', title: 'Accounts connected', body: `You approved sharing for ${ids.length} account${ids.length === 1 ? '' : 's'}. You can revoke this anytime.`, link: '/accounts', dedupeKey: `consent-active:${consent.id}` });
    if (user.onboarding_state !== 'READY') await setOnboardingState(ctx, userId, 'SYNCING');
    await startSync(ctx, userId);
  } else if (n.status === 'REJECTED') {
    if (user.onboarding_state !== 'READY') await setOnboardingState(ctx, userId, 'CONSENT_REJECTED');
    await notify(ctx, userId, { kind: 'CONSENT', title: 'Consent not approved', body: 'No data was shared. You can try again whenever you are ready.', link: '/accounts', dedupeKey: `consent-rejected:${consent.id}` });
  } else if (n.status === 'REVOKED' || n.status === 'EXPIRED') {
    await removeConsentData(ctx, consent);
  }
}

async function removeConsentData(ctx: AppContext, consent: ConsentRow): Promise<void> {
  const ids: string[] = JSON.parse(consent.account_ids);
  // Keep only accounts not covered by another active consent.
  const stillCovered = new Set(
    (await activeConsents(ctx, consent.user_id)).filter((c) => c.id !== consent.id).flatMap((c) => JSON.parse(c.account_ids) as string[]),
  );
  const toRemove = ids.filter((id) => !stillCovered.has(id));
  await deleteTxnsForAccounts(ctx, consent.user_id, toRemove);
  await deleteHoldingsForAccounts(ctx, consent.user_id, toRemove);
  for (const id of toRemove) {
    await ctx.db.run(
      "UPDATE accounts SET linked = 0, consent_id = NULL, current_balance = 0, sync_status = 'PENDING', last_synced_at = NULL, updated_at = ? WHERE user_id = ? AND id = ?",
      nowISO(ctx), consent.user_id, id,
    );
  }
  await consentEvent(ctx, consent.id, consent.user_id, 'DATA_DELETED', { accounts: toRemove.length });
  await recompute(ctx, consent.user_id);
}

export async function revokeConsent(ctx: AppContext, userId: string, consentId: string): Promise<ConsentDTO> {
  const consent = await getConsent(ctx, userId, consentId);
  if (!consent) throw notFound('Consent not found.');
  if (consent.status === 'REVOKED') return toConsentDTO(consent, await listAccounts(ctx, userId));
  if (consent.status === 'ACTIVE' || consent.status === 'PENDING' || consent.status === 'PAUSED') {
    await ctx.aa.revokeConsent(consent.provider_consent_id);
  }
  await setConsentStatus(ctx, consent, 'REVOKED', { source: 'user' });
  await removeConsentData(ctx, consent);
  await audit(ctx, userId, 'CONSENT_REVOKED', { consentId });
  await notify(ctx, userId, { kind: 'CONSENT', title: 'Consent revoked', body: 'Data sharing stopped and the related data was removed from Finance Buddy.', link: '/accounts', dedupeKey: `consent-revoked:${consent.id}` });
  return toConsentDTO((await getConsent(ctx, userId, consentId))!, await listAccounts(ctx, userId));
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

export async function startSync(ctx: AppContext, userId: string): Promise<JobDTO> {
  const latest = await latestJob(ctx, userId, 'SYNC');
  if (latest && latest.status === 'RUNNING' && Date.now() - Date.parse(latest.updatedAt) < STALE_JOB_MS) return latest;
  if (latest && latest.status === 'RUNNING') await finishJob(ctx, latest.id, 'FAILED', 'The previous update was interrupted.');
  if ((await activeConsents(ctx, userId)).length === 0) throw conflict('Connect an account before syncing.', 'NO_ACTIVE_CONSENT');
  const job = await createJob(ctx, userId, 'SYNC', SYNC_STEPS);
  ctx.background(runSync(ctx, userId, job.id));
  return job;
}

export async function syncJob(ctx: AppContext, userId: string, jobId?: string): Promise<JobDTO | undefined> {
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
  try {
    const user = (await getUser(ctx, userId))!;
    // 1. Fetch FI data for every active consent.
    await setStep(ctx, jobId, 'fetch', 'RUNNING');
    const payloads: FIPayload[] = [];
    const failures: DataSessionResult['failures'] = [];
    for (const consent of await activeConsents(ctx, userId)) {
      const to = nowISO(ctx);
      const { providerSessionId } = await ctx.aa.createDataSession({ providerConsentId: consent.provider_consent_id, from: consent.data_from, to });
      const sessionId = `ds_${jobId}_${consent.id}`;
      await ctx.db.run(
        'INSERT INTO data_sessions (id, user_id, consent_id, provider_session_id, status, data_from, data_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sessionId, userId, consent.id, providerSessionId, 'PENDING', consent.data_from, to, nowISO(ctx),
      );
      const result = await pollSession(ctx, providerSessionId);
      await ctx.db.run('UPDATE data_sessions SET status = ?, completed_at = ?, error = ? WHERE id = ?', result.status, nowISO(ctx), result.failures.length ? JSON.stringify(result.failures) : null, sessionId);
      await consentEvent(ctx, consent.id, userId, 'DATA_FETCHED', { status: result.status, accounts: result.accounts.length, failures: result.failures.length });
      payloads.push(...result.accounts);
      failures.push(...result.failures);
      await ctx.db.run('UPDATE consents SET data_to = ?, updated_at = ? WHERE id = ?', to, nowISO(ctx), consent.id);
    }
    if (payloads.length === 0) throw new Error(failures[0]?.reason ?? 'No data received');
    await setStep(ctx, jobId, 'fetch', 'DONE');

    // 2. Normalise + dedupe deposits.
    await setStep(ctx, jobId, 'normalize', 'RUNNING');
    const accounts = await listAccounts(ctx, userId);
    const byRef = new Map(accounts.map((a) => [a.provider_ref, a]));
    const failedRefs = new Set(failures.map((f) => f.providerRef));
    const holderNames: string[] = [];
    const rules = await loadUserRules(ctx, userId);
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
        await insertTxns(ctx, userId, n.txns);
        await ctx.db.run(
          "UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', holder_name_enc = ?, updated_at = ? WHERE id = ?",
          n.currentBalance, n.balanceAsOf, now, ctx.vault.encrypt(p.holderName), now, acc.id,
        );
        if (n.rejected) ctx.log('warn', 'rejected malformed transactions', { account: acc.id, rejected: n.rejected });
      }
    }
    for (const ref of failedRefs) {
      const acc = byRef.get(ref);
      if (acc) await ctx.db.run("UPDATE accounts SET sync_status = 'FAILED', updated_at = ? WHERE id = ?", now, acc.id);
    }
    await setStep(ctx, jobId, 'normalize', 'DONE');

    // 3. Categorise (rules + engine passes) and 4. recurring detection (both inside recompute).
    await setStep(ctx, jobId, 'categorize', 'RUNNING');
    // The profile name starts as the bank's account-holder name. While it is still that copy (never
    // edited in Settings), it follows the bank if the bank's name changes; a name the user typed stays.
    const current = userName(ctx, user);
    const fromBank = accounts.some((a) => a.holder_name_enc && titleCase(ctx.vault.decrypt(a.holder_name_enc)) === current);
    if (holderNames[0] && (!current || fromBank) && current !== titleCase(holderNames[0])) await updateProfile(ctx, userId, { name: titleCase(holderNames[0]) });
    await recompute(ctx, userId);
    await setStep(ctx, jobId, 'categorize', 'DONE');
    await setStep(ctx, jobId, 'recurring', 'RUNNING');
    await setStep(ctx, jobId, 'recurring', 'DONE');

    // 5. Investments.
    await setStep(ctx, jobId, 'investments', 'RUNNING');
    for (const p of payloads) {
      const acc = byRef.get(p.providerRef);
      if (!acc) continue;
      if (p.kind === 'MUTUAL_FUNDS') {
        const { holdings, value } = normalizeMutualFunds(p, acc.id);
        await saveHolding(ctx, userId, acc.id, 'MUTUAL_FUNDS', holdings);
        for (const h of holdings) {
          const first = h.transactions.reduce((m, t) => (Date.parse(t.date) < Date.parse(m) ? t.date : m), now);
          await saveNavs(ctx, h.schemeCode, await ctx.market.navHistory(h.schemeCode, first, now));
        }
        await ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', updated_at = ? WHERE id = ?", value, now, now, now, acc.id);
      } else if (p.kind === 'TERM_DEPOSIT') {
        const fd = normalizeTermDeposit(p, acc.id);
        await saveHolding(ctx, userId, acc.id, 'TERM_DEPOSIT', fd);
        await ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', updated_at = ? WHERE id = ?", fd.currentValue, now, now, now, acc.id);
      } else if (p.kind === 'EPF') {
        const epf = normalizeEPF(p, acc.id);
        await saveHolding(ctx, userId, acc.id, 'EPF', epf);
        await ctx.db.run("UPDATE accounts SET current_balance = ?, balance_as_of = ?, last_synced_at = ?, sync_status = 'OK', updated_at = ? WHERE id = ?", epf.balance, now, now, now, acc.id);
      }
    }
    await bumpDataVersion(ctx, userId);
    await setStep(ctx, jobId, 'investments', 'DONE');

    // 6. Profile: notifications, first brief, onboarding complete.
    await setStep(ctx, jobId, 'profile', 'RUNNING');
    await generateNotifications(ctx, userId);
    await setStep(ctx, jobId, 'profile', 'DONE');
    const partial = failures.length > 0;
    await finishJob(ctx, jobId, partial ? 'PARTIAL' : 'COMPLETED', partial ? `${failures.length} account${failures.length === 1 ? '' : 's'} could not be synced.` : null);
    if (partial) {
      await notify(ctx, userId, { kind: 'SYNC', title: 'Some accounts did not sync', body: 'Your picture is incomplete. Retry from Accounts.', link: '/accounts', dedupeKey: `sync-partial:${jobId}` });
    }
    if ((await getUser(ctx, userId))!.onboarding_state !== 'READY') await setOnboardingState(ctx, userId, 'READY');
    await audit(ctx, userId, 'SYNC_COMPLETED', { partial, failures: failures.length });
  } catch (e) {
    ctx.log('error', 'sync failed', { error: String(e), stack: (e as Error).stack });
    await finishJob(ctx, jobId, 'FAILED', 'We could not fetch your data right now. Please retry.');
    const u = await getUser(ctx, userId);
    if (u?.onboarding_state === 'SYNCING') await setOnboardingState(ctx, userId, 'SYNC_FAILED');
    await notify(ctx, userId, { kind: 'SYNC', title: 'Sync failed', body: 'We could not fetch your data. Tap to retry.', link: '/accounts', dedupeKey: `sync-failed:${jobId}` });
  }
}

/** Upcoming payment reminders (next 3 days) and the current SI observation. Deduplicated. */
export async function generateNotifications(ctx: AppContext, userId: string): Promise<void> {
  const state = await financialState(ctx, userId);
  const fctx = forecastContext(state);
  for (const u of upcomingPayments(fctx.recurring, state.now, 3)) {
    await notify(ctx, userId, {
      kind: 'UPCOMING_PAYMENT',
      title: `${u.merchantName} due ${formatDate(u.dueDate)}`,
      body: `${formatINR(u.amount, { decimals: 0 })} is expected based on your past payments.`,
      link: '/upcoming',
      dedupeKey: `upcoming:${u.seriesKey}:${u.dueDateKey}`,
    });
  }
  const insight = topInsight(state, fctx);
  if (insight) {
    await notify(ctx, userId, { kind: 'INSIGHT', title: insight.title, body: insight.body, link: '/si', dedupeKey: `insight:${insight.id}` });
  }
}
