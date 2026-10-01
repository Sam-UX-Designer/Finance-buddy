import { isDepositAccount, type Account, type AccountDTO, type AccountType, type DiscoveredAccountDTO } from '@moneymate/core';
import { nowISO, type AppContext } from '../context';
import { newId } from '../lib/crypto';
import { ACCOUNT_TYPE_LABELS, fip } from '../aa/fips';

export interface AccountRow {
  id: string;
  user_id: string;
  provider_ref: string;
  fip_id: string;
  type: AccountType;
  masked_number: string;
  display_name: string;
  linked: number;
  current_balance: number;
  balance_as_of: string | null;
  last_synced_at: string | null;
  sync_status: 'OK' | 'PARTIAL' | 'FAILED' | 'PENDING';
  consent_id: string | null;
  holder_name_enc: string | null;
  created_at: string;
  updated_at: string;
}

export function listAccounts(ctx: AppContext, userId: string): AccountRow[] {
  return ctx.db.all<AccountRow>('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at, id', userId);
}

export function linkedAccounts(ctx: AppContext, userId: string): AccountRow[] {
  return ctx.db.all<AccountRow>('SELECT * FROM accounts WHERE user_id = ? AND linked = 1 ORDER BY created_at, id', userId);
}

export function getAccount(ctx: AppContext, userId: string, id: string): AccountRow | undefined {
  return ctx.db.get<AccountRow>('SELECT * FROM accounts WHERE user_id = ? AND id = ?', userId, id);
}

export function upsertDiscoveredAccount(
  ctx: AppContext,
  userId: string,
  a: { providerRef: string; fipId: string; type: AccountType; maskedNumber: string },
): AccountRow {
  const existing = ctx.db.get<AccountRow>('SELECT * FROM accounts WHERE user_id = ? AND provider_ref = ?', userId, a.providerRef);
  if (existing) return existing;
  const now = nowISO(ctx);
  const id = newId('acc');
  ctx.db.run(
    `INSERT INTO accounts (id, user_id, provider_ref, fip_id, type, masked_number, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    a.providerRef,
    a.fipId,
    a.type,
    a.maskedNumber,
    `${fip(a.fipId).shortName} ${ACCOUNT_TYPE_LABELS[a.type]}`,
    now,
    now,
  );
  return getAccount(ctx, userId, id)!;
}

export function toDiscoveredDTO(row: AccountRow): DiscoveredAccountDTO {
  return {
    id: row.id,
    fip: fip(row.fip_id),
    type: row.type,
    typeLabel: ACCOUNT_TYPE_LABELS[row.type],
    maskedNumber: row.masked_number,
    displayName: row.display_name,
    group: isDepositAccount(row.type) ? 'BANK' : 'INVESTMENT',
    linked: row.linked === 1,
  };
}

export function toEngineAccount(row: AccountRow): Account {
  return {
    id: row.id,
    fipId: row.fip_id,
    fipName: fip(row.fip_id).name,
    type: row.type,
    maskedNumber: row.masked_number,
    displayName: row.display_name,
    currentBalance: row.current_balance,
    balanceAsOf: row.balance_as_of ?? row.updated_at,
    linked: row.linked === 1,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
  };
}

export function toAccountDTO(
  row: AccountRow,
  consentStatus: AccountDTO['consentStatus'],
  reconciliation: AccountDTO['reconciliation'],
): AccountDTO {
  return {
    id: row.id,
    fip: fip(row.fip_id),
    type: row.type,
    typeLabel: ACCOUNT_TYPE_LABELS[row.type],
    maskedNumber: row.masked_number,
    displayName: row.display_name,
    balance: row.current_balance,
    balanceAsOf: row.balance_as_of,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    consentId: row.consent_id,
    consentStatus,
    reconciliation,
  };
}
