import type { CategoryId, ClassificationSource, Direction, PaymentMode, SplitPart, Txn, TxnType, UserRule } from '@finance-buddy/core';
import { nowISO, type AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../lib/crypto';

interface TxnRow {
  id: string;
  user_id: string;
  account_id: string;
  dedupe_key: string;
  posted_at: string;
  seq: number;
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
  seq: number;
}

const BATCH = 200;

function chunks<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Inserts transactions, skipping duplicates (same account + provider transaction id). Returns inserted count. */
export async function insertTxns(ctx: AppContext, userId: string, txns: NewTxn[]): Promise<number> {
  const now = nowISO(ctx);
  const cols = 22;
  let inserted = 0;
  await ctx.db.tx(async (tx) => {
    for (const part of chunks(txns)) {
      const values: unknown[] = [];
      const rows = part.map((t) => {
        values.push(
          newId('txn'), userId, t.accountId, t.dedupeKey, t.postedAt, t.seq, t.amount, t.direction, t.mode,
          ctx.vault.encrypt(t.narration), ctx.vault.encryptNullable(t.reference), t.merchantKey, t.merchantName,
          ctx.vault.encryptNullable(t.counterparty), t.categoryId, t.type, t.confidence, 'RULE', 'RULE', t.balanceAfter, now, now,
        );
        return `(${Array.from({ length: cols }, () => '?').join(', ')})`;
      });
      const r = await tx.run(
        `INSERT INTO transactions (id, user_id, account_id, dedupe_key, posted_at, seq, amount, direction, mode, narration_enc, reference_enc,
           merchant_key, merchant_name, counterparty_enc, category_id, type, confidence, type_source, category_source, balance_after, created_at, updated_at)
         VALUES ${rows.join(', ')} ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        ...values,
      );
      inserted += r.changes;
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
    seq: r.seq,
    note: ctx.vault.decryptNullable(r.note_enc),
    splits: r.splits ? (JSON.parse(r.splits) as SplitPart[]) : null,
  };
}

/** All transactions for the user (decrypted), oldest first, optionally limited to some accounts. */
export async function loadTxns(ctx: AppContext, userId: string, accountIds?: string[]): Promise<Txn[]> {
  const rows = await ctx.db.all<TxnRow>('SELECT * FROM transactions WHERE user_id = ? ORDER BY posted_at, seq, id', userId);
  const set = accountIds ? new Set(accountIds) : null;
  return rows.filter((r) => !set || set.has(r.account_id)).map((r) => toTxn(ctx, r));
}

export async function getTxn(ctx: AppContext, userId: string, id: string): Promise<Txn | undefined> {
  const r = await ctx.db.get<TxnRow>('SELECT * FROM transactions WHERE user_id = ? AND id = ?', userId, id);
  return r ? toTxn(ctx, r) : undefined;
}

/** Persists engine/rule classification for many transactions in batched UPDATE … FROM (VALUES …). */
export async function saveClassifications(ctx: AppContext, txns: Txn[]): Promise<void> {
  const now = nowISO(ctx);
  await ctx.db.tx(async (tx) => {
    for (const part of chunks(txns)) {
      const values: unknown[] = [];
      const rows = part.map((t) => {
        values.push(
          t.id, t.merchantKey, t.merchantName, ctx.vault.encryptNullable(t.counterparty ?? null), t.categoryId, t.type, t.confidence,
          t.typeSource, t.categorySource, t.isRecurring ? 1 : 0, t.recurringSource ?? null,
        );
        return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      });
      await tx.run(
        `UPDATE transactions AS t SET
           merchant_key = v.merchant_key, merchant_name = v.merchant_name, counterparty_enc = v.counterparty_enc,
           category_id = v.category_id, type = v.type, confidence = v.confidence::double precision,
           type_source = v.type_source, category_source = v.category_source,
           is_recurring = v.is_recurring::integer, recurring_source = v.recurring_source, updated_at = ?
         FROM (VALUES ${rows.join(', ')}) AS v(id, merchant_key, merchant_name, counterparty_enc, category_id, type, confidence,
           type_source, category_source, is_recurring, recurring_source)
         WHERE t.id = v.id`,
        now,
        ...values,
      );
    }
  });
}

export async function updateTxnUserFields(
  ctx: AppContext,
  userId: string,
  id: string,
  patch: { categoryId?: CategoryId; type?: TxnType; note?: string | null; isRecurring?: boolean; splits?: SplitPart[] | null },
): Promise<void> {
  const before = await getTxn(ctx, userId, id);
  if (!before) return;
  const now = nowISO(ctx);
  await ctx.db.tx(async (tx: Db) => {
    const log = (field: string, oldV: unknown, newV: unknown) =>
      tx.run(
        'INSERT INTO corrections (id, user_id, transaction_id, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        newId('cor'), userId, id, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV), now,
      );
    if (patch.categoryId !== undefined) {
      await tx.run("UPDATE transactions SET category_id = ?, category_source = 'USER', confidence = 1, updated_at = ? WHERE id = ? AND user_id = ?", patch.categoryId, now, id, userId);
      await log('category', before.categoryId, patch.categoryId);
    }
    if (patch.type !== undefined) {
      await tx.run("UPDATE transactions SET type = ?, type_source = 'USER', confidence = 1, updated_at = ? WHERE id = ? AND user_id = ?", patch.type, now, id, userId);
      await log('type', before.type, patch.type);
    }
    if (patch.note !== undefined) {
      await tx.run('UPDATE transactions SET note_enc = ?, updated_at = ? WHERE id = ? AND user_id = ?', ctx.vault.encryptNullable(patch.note?.trim() || null), now, id, userId);
    }
    if (patch.isRecurring !== undefined) {
      await tx.run("UPDATE transactions SET is_recurring = ?, recurring_source = 'USER', updated_at = ? WHERE id = ? AND user_id = ?", patch.isRecurring ? 1 : 0, now, id, userId);
      await log('recurring', before.isRecurring, patch.isRecurring);
    }
    if (patch.splits !== undefined) {
      await tx.run('UPDATE transactions SET splits = ?, updated_at = ? WHERE id = ? AND user_id = ?', patch.splits && patch.splits.length ? JSON.stringify(patch.splits) : null, now, id, userId);
      await log('splits', before.splits ? JSON.stringify(before.splits) : null, patch.splits ? JSON.stringify(patch.splits) : null);
    }
  });
}

/** Marks other transactions of the same merchant as recurring/not (user intent applies to the series). */
export async function setMerchantRecurring(ctx: AppContext, userId: string, merchantKey: string, isRecurring: boolean): Promise<void> {
  await ctx.db.run(
    "UPDATE transactions SET is_recurring = ?, recurring_source = 'USER', updated_at = ? WHERE user_id = ? AND merchant_key = ? AND direction = 'DEBIT'",
    isRecurring ? 1 : 0, nowISO(ctx), userId, merchantKey,
  );
}

export async function loadUserRules(ctx: AppContext, userId: string): Promise<UserRule[]> {
  const rows = await ctx.db.all<{ merchant_key: string; category_id: CategoryId | null; type: TxnType | null }>(
    'SELECT merchant_key, category_id, type FROM user_rules WHERE user_id = ?',
    userId,
  );
  return rows.map((r) => ({ merchantKey: r.merchant_key, categoryId: r.category_id, type: r.type }));
}

/** Learned signal for future categorisation of this merchant (Blueprint §9). */
export async function saveUserRule(ctx: AppContext, userId: string, merchantKey: string, patch: { categoryId?: CategoryId; type?: TxnType }): Promise<void> {
  const existing = await ctx.db.get<{ category_id: string | null; type: string | null }>('SELECT category_id, type FROM user_rules WHERE user_id = ? AND merchant_key = ?', userId, merchantKey);
  await ctx.db.run(
    `INSERT INTO user_rules (user_id, merchant_key, category_id, type, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, merchant_key) DO UPDATE SET category_id = excluded.category_id, type = excluded.type`,
    userId, merchantKey, patch.categoryId ?? existing?.category_id ?? null, patch.type ?? existing?.type ?? null, nowISO(ctx),
  );
}

export async function deleteTxnsForAccounts(ctx: AppContext, userId: string, accountIds: string[]): Promise<void> {
  for (const id of accountIds) await ctx.db.run('DELETE FROM transactions WHERE user_id = ? AND account_id = ?', userId, id);
}
