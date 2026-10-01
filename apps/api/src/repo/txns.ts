import type { CategoryId, ClassificationSource, Direction, PaymentMode, SplitPart, Txn, TxnType, UserRule } from '@moneymate/core';
import { nowISO, type AppContext } from '../context';
import { newId } from '../lib/crypto';

interface TxnRow {
  id: string;
  user_id: string;
  account_id: string;
  dedupe_key: string;
  posted_at: string;
  amount: number;
  direction: Direction;
  mode: PaymentMode;
  narration_enc: string;
  reference_enc: string | null;
  merchant_key: string;
  merchant_name: string;
  counterparty_enc: string | null;
  category_id: CategoryId;
  type: TxnType;
  confidence: number;
  type_source: ClassificationSource;
  category_source: ClassificationSource;
  is_recurring: number;
  recurring_source: ClassificationSource | null;
  balance_after: number | null;
  note_enc: string | null;
  splits: string | null;
}

export interface NewTxn {
  accountId: string;
  dedupeKey: string;
  postedAt: string;
  amount: number;
  direction: Direction;
  mode: PaymentMode;
  narration: string;
  reference: string | null;
  merchantKey: string;
  merchantName: string;
  counterparty: string | null;
  categoryId: CategoryId;
  type: TxnType;
  confidence: number;
  balanceAfter: number | null;
}

/** Inserts transactions, skipping duplicates (same account + provider transaction id). Returns inserted count. */
export function insertTxns(ctx: AppContext, userId: string, txns: NewTxn[]): number {
  const now = nowISO(ctx);
  const stmt = ctx.db.raw.prepare(
    `INSERT OR IGNORE INTO transactions (id, user_id, account_id, dedupe_key, posted_at, amount, direction, mode, narration_enc, reference_enc,
       merchant_key, merchant_name, counterparty_enc, category_id, type, confidence, type_source, category_source, balance_after, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RULE', 'RULE', ?, ?, ?)`,
  );
  let inserted = 0;
  ctx.db.tx(() => {
    for (const t of txns) {
      const r = stmt.run(
        newId('txn'), userId, t.accountId, t.dedupeKey, t.postedAt, t.amount, t.direction, t.mode,
        ctx.vault.encrypt(t.narration), ctx.vault.encryptNullable(t.reference), t.merchantKey, t.merchantName,
        ctx.vault.encryptNullable(t.counterparty), t.categoryId, t.type, t.confidence, t.balanceAfter, now, now,
      );
      inserted += Number(r.changes);
    }
  });
  return inserted;
}

function toTxn(ctx: AppContext, r: TxnRow): Txn & { reference: string | null } {
  return {
    id: r.id,
    accountId: r.account_id,
    postedAt: r.posted_at,
    amount: r.amount,
    direction: r.direction,
    mode: r.mode,
    narration: ctx.vault.decrypt(r.narration_enc),
    reference: ctx.vault.decryptNullable(r.reference_enc),
    merchantKey: r.merchant_key,
    merchantName: r.merchant_name,
    counterparty: ctx.vault.decryptNullable(r.counterparty_enc),
    categoryId: r.category_id,
    type: r.type,
    confidence: r.confidence,
    typeSource: r.type_source,
    categorySource: r.category_source,
    isRecurring: r.is_recurring === 1,
    recurringSource: r.recurring_source,
    balanceAfter: r.balance_after,
    note: ctx.vault.decryptNullable(r.note_enc),
    splits: r.splits ? (JSON.parse(r.splits) as SplitPart[]) : null,
  };
}

/** All transactions for the user (decrypted), oldest first, optionally limited to some accounts. */
export function loadTxns(ctx: AppContext, userId: string, accountIds?: string[]): Txn[] {
  const rows = ctx.db.all<TxnRow>('SELECT * FROM transactions WHERE user_id = ? ORDER BY posted_at, id', userId);
  const set = accountIds ? new Set(accountIds) : null;
  return rows.filter((r) => !set || set.has(r.account_id)).map((r) => toTxn(ctx, r));
}

export function getTxn(ctx: AppContext, userId: string, id: string): Txn | undefined {
  const r = ctx.db.get<TxnRow>('SELECT * FROM transactions WHERE user_id = ? AND id = ?', userId, id);
  return r ? toTxn(ctx, r) : undefined;
}

/** Persists engine/rule classification for many transactions. */
export function saveClassifications(ctx: AppContext, txns: Txn[]): void {
  const now = nowISO(ctx);
  const stmt = ctx.db.raw.prepare(
    `UPDATE transactions SET merchant_key = ?, merchant_name = ?, counterparty_enc = ?, category_id = ?, type = ?, confidence = ?,
       type_source = ?, category_source = ?, is_recurring = ?, recurring_source = ?, updated_at = ? WHERE id = ?`,
  );
  ctx.db.tx(() => {
    for (const t of txns) {
      stmt.run(
        t.merchantKey, t.merchantName, ctx.vault.encryptNullable(t.counterparty ?? null), t.categoryId, t.type, t.confidence,
        t.typeSource, t.categorySource, t.isRecurring ? 1 : 0, t.recurringSource ?? null, now, t.id,
      );
    }
  });
}

export function updateTxnUserFields(
  ctx: AppContext,
  userId: string,
  id: string,
  patch: { categoryId?: CategoryId; type?: TxnType; note?: string | null; isRecurring?: boolean; splits?: SplitPart[] | null },
): void {
  const before = getTxn(ctx, userId, id);
  if (!before) return;
  const now = nowISO(ctx);
  const log = (field: string, oldV: unknown, newV: unknown) =>
    ctx.db.run(
      'INSERT INTO corrections (id, user_id, transaction_id, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId('cor'), userId, id, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV), now,
    );
  if (patch.categoryId !== undefined) {
    ctx.db.run("UPDATE transactions SET category_id = ?, category_source = 'USER', confidence = 1, updated_at = ? WHERE id = ?", patch.categoryId, now, id);
    log('category', before.categoryId, patch.categoryId);
  }
  if (patch.type !== undefined) {
    ctx.db.run("UPDATE transactions SET type = ?, type_source = 'USER', confidence = 1, updated_at = ? WHERE id = ?", patch.type, now, id);
    log('type', before.type, patch.type);
  }
  if (patch.note !== undefined) {
    ctx.db.run('UPDATE transactions SET note_enc = ?, updated_at = ? WHERE id = ?', ctx.vault.encryptNullable(patch.note?.trim() || null), now, id);
  }
  if (patch.isRecurring !== undefined) {
    ctx.db.run("UPDATE transactions SET is_recurring = ?, recurring_source = 'USER', updated_at = ? WHERE id = ?", patch.isRecurring ? 1 : 0, now, id);
    log('recurring', before.isRecurring, patch.isRecurring);
  }
  if (patch.splits !== undefined) {
    ctx.db.run('UPDATE transactions SET splits = ?, updated_at = ? WHERE id = ?', patch.splits && patch.splits.length ? JSON.stringify(patch.splits) : null, now, id);
    log('splits', before.splits ? JSON.stringify(before.splits) : null, patch.splits ? JSON.stringify(patch.splits) : null);
  }
}

/** Marks other transactions of the same merchant as recurring/not (user intent applies to the series). */
export function setMerchantRecurring(ctx: AppContext, userId: string, merchantKey: string, isRecurring: boolean): void {
  ctx.db.run(
    "UPDATE transactions SET is_recurring = ?, recurring_source = 'USER', updated_at = ? WHERE user_id = ? AND merchant_key = ? AND direction = 'DEBIT'",
    isRecurring ? 1 : 0, nowISO(ctx), userId, merchantKey,
  );
}

export function loadUserRules(ctx: AppContext, userId: string): UserRule[] {
  return ctx.db
    .all<{ merchant_key: string; category_id: CategoryId | null; type: TxnType | null }>('SELECT merchant_key, category_id, type FROM user_rules WHERE user_id = ?', userId)
    .map((r) => ({ merchantKey: r.merchant_key, categoryId: r.category_id, type: r.type }));
}

/** Learned signal for future categorisation of this merchant (Blueprint §9). */
export function saveUserRule(ctx: AppContext, userId: string, merchantKey: string, patch: { categoryId?: CategoryId; type?: TxnType }): void {
  const existing = ctx.db.get<{ category_id: string | null; type: string | null }>('SELECT category_id, type FROM user_rules WHERE user_id = ? AND merchant_key = ?', userId, merchantKey);
  ctx.db.run(
    `INSERT INTO user_rules (user_id, merchant_key, category_id, type, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, merchant_key) DO UPDATE SET category_id = excluded.category_id, type = excluded.type`,
    userId, merchantKey, patch.categoryId ?? existing?.category_id ?? null, patch.type ?? existing?.type ?? null, nowISO(ctx),
  );
}

export function deleteTxnsForAccounts(ctx: AppContext, userId: string, accountIds: string[]): void {
  for (const id of accountIds) ctx.db.run('DELETE FROM transactions WHERE user_id = ? AND account_id = ?', userId, id);
}
