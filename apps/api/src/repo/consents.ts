import type { ConsentDTO, ConsentStatus } from '@finance-buddy/core';
import { nowISO, type AppContext } from '../context';
import { newId } from '../lib/crypto';
import { fip } from '../aa/fips';
import type { AccountRow } from './accounts';

export interface ConsentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_consent_id: string;
  status: ConsentStatus;
  purpose_code: string;
  purpose: string;
  fi_types: string;
  data_from: string;
  data_to: string;
  expires_at: string;
  fetch_type: 'ONETIME' | 'PERIODIC';
  frequency: string;
  account_ids: string;
  approval_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertConsent(ctx: AppContext, row: Omit<ConsentRow, 'id' | 'created_at' | 'updated_at'>): Promise<ConsentRow> {
  const id = newId('cns');
  const now = nowISO(ctx);
  await ctx.db.run(
    `INSERT INTO consents (id, user_id, provider, provider_consent_id, status, purpose_code, purpose, fi_types, data_from, data_to,
       expires_at, fetch_type, frequency, account_ids, approval_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, row.user_id, row.provider, row.provider_consent_id, row.status, row.purpose_code, row.purpose, row.fi_types,
    row.data_from, row.data_to, row.expires_at, row.fetch_type, row.frequency, row.account_ids, row.approval_url, now, now,
  );
  await consentEvent(ctx, id, row.user_id, 'CREATED', { status: row.status });
  return (await getConsent(ctx, row.user_id, id))!;
}

export function getConsent(ctx: AppContext, userId: string, id: string): Promise<ConsentRow | undefined> {
  return ctx.db.get<ConsentRow>('SELECT * FROM consents WHERE user_id = ? AND id = ?', userId, id);
}

export function getConsentByProviderId(ctx: AppContext, providerConsentId: string): Promise<ConsentRow | undefined> {
  return ctx.db.get<ConsentRow>('SELECT * FROM consents WHERE provider_consent_id = ?', providerConsentId);
}

export function listConsents(ctx: AppContext, userId: string): Promise<ConsentRow[]> {
  return ctx.db.all<ConsentRow>('SELECT * FROM consents WHERE user_id = ? ORDER BY created_at DESC', userId);
}

export function activeConsents(ctx: AppContext, userId: string): Promise<ConsentRow[]> {
  return ctx.db.all<ConsentRow>("SELECT * FROM consents WHERE user_id = ? AND status = 'ACTIVE' ORDER BY created_at", userId);
}

export async function setConsentStatus(ctx: AppContext, consent: ConsentRow, status: ConsentStatus, detail?: Record<string, unknown>): Promise<void> {
  await ctx.db.run('UPDATE consents SET status = ?, updated_at = ? WHERE id = ?', status, nowISO(ctx), consent.id);
  await consentEvent(ctx, consent.id, consent.user_id, `STATUS_${status}`, detail);
}

/** Audit trail of consent state and data access (Blueprint §23). */
export async function consentEvent(ctx: AppContext, consentId: string, userId: string, event: string, detail?: Record<string, unknown>): Promise<void> {
  await ctx.db.run(
    'INSERT INTO consent_events (id, consent_id, user_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    newId('cev'), consentId, userId, event, detail ? JSON.stringify(detail) : null, nowISO(ctx),
  );
}

export const DATA_SHARED_LABELS: Record<string, string[]> = {
  DEPOSIT: ['Account details', 'Transaction history', 'Current balance'],
  TERM_DEPOSIT: ['Deposit details and value'],
  MUTUAL_FUNDS: ['Fund holdings and transactions'],
  EPF: ['Provident fund balance and contributions'],
};

export function dataSharedFor(fiTypes: string[], monthsOfHistory: number): string[] {
  const out: string[] = [];
  for (const t of fiTypes) {
    for (const label of DATA_SHARED_LABELS[t] ?? []) {
      const l = label === 'Transaction history' ? `Transaction history (last ${monthsOfHistory} months)` : label;
      if (!out.includes(l)) out.push(l);
    }
  }
  return out;
}

export function toConsentDTO(row: ConsentRow, accounts: AccountRow[]): ConsentDTO {
  const ids: string[] = JSON.parse(row.account_ids);
  const fiTypes: string[] = JSON.parse(row.fi_types);
  const months = Math.round((Date.parse(row.data_to) - Date.parse(row.data_from)) / (30.44 * 86400000));
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    purpose: row.purpose,
    purposeCode: row.purpose_code,
    dataShared: dataSharedFor(fiTypes, months),
    fiTypes,
    dataFrom: row.data_from,
    dataTo: row.data_to,
    expiresAt: row.expires_at,
    fetchType: row.fetch_type,
    frequency: row.frequency,
    accounts: accounts
      .filter((a) => ids.includes(a.id))
      .map((a) => ({ id: a.id, fip: fip(a.fip_id), maskedNumber: a.masked_number, displayName: a.display_name })),
    approvalUrl: row.status === 'PENDING' ? row.approval_url : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
