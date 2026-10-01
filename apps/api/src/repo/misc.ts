import type {
  Budget,
  CategoryId,
  EPFAccount,
  ForecastAssumptions,
  Goal,
  GoalBody,
  Holdings,
  MFHolding,
  NotificationDTO,
  SIConversationDTO,
  SIMessageDTO,
  TermDeposit,
} from '@finance-buddy/core';
import { nowISO, type AppContext } from '../context';
import { newId } from '../lib/crypto';

// ── Holdings ─────────────────────────────────────────────────────────
type HoldingKind = 'MUTUAL_FUNDS' | 'TERM_DEPOSIT' | 'EPF';

export async function saveHolding(ctx: AppContext, userId: string, accountId: string, kind: HoldingKind, data: MFHolding[] | TermDeposit | EPFAccount): Promise<void> {
  await ctx.db.run(
    `INSERT INTO holdings (id, user_id, account_id, kind, data_enc, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id, kind) DO UPDATE SET data_enc = excluded.data_enc, updated_at = excluded.updated_at`,
    newId('hld'), userId, accountId, kind, ctx.vault.encrypt(JSON.stringify(data)), nowISO(ctx),
  );
}

export async function loadHoldings(ctx: AppContext, userId: string, linkedIds: Set<string>): Promise<Holdings> {
  const rows = await ctx.db.all<{ account_id: string; kind: HoldingKind; data_enc: string }>('SELECT account_id, kind, data_enc FROM holdings WHERE user_id = ?', userId);
  const out: Holdings = { mutualFunds: [], termDeposits: [], epf: [] };
  for (const r of rows) {
    if (!linkedIds.has(r.account_id)) continue;
    const data = JSON.parse(ctx.vault.decrypt(r.data_enc));
    if (r.kind === 'MUTUAL_FUNDS') out.mutualFunds.push(...(data as MFHolding[]));
    else if (r.kind === 'TERM_DEPOSIT') out.termDeposits.push(data as TermDeposit);
    else out.epf.push(data as EPFAccount);
  }
  return out;
}

export async function deleteHoldingsForAccounts(ctx: AppContext, userId: string, accountIds: string[]): Promise<void> {
  for (const id of accountIds) await ctx.db.run('DELETE FROM holdings WHERE user_id = ? AND account_id = ?', userId, id);
}

export async function saveNavs(ctx: AppContext, schemeCode: string, rows: { date: string; nav: number }[]): Promise<void> {
  if (!rows.length) return;
  const values: unknown[] = [];
  const tuples = rows.map((r) => {
    values.push(schemeCode, r.date, r.nav);
    return '(?, ?, ?)';
  });
  await ctx.db.run(
    `INSERT INTO nav_history (scheme_code, date, nav) VALUES ${tuples.join(', ')}
     ON CONFLICT (scheme_code, date) DO UPDATE SET nav = excluded.nav`,
    ...values,
  );
}

/** Returns a lookup giving the latest stored NAV on or before a date. */
export async function navLookup(ctx: AppContext, schemeCodes: string[]): Promise<(code: string, dateISO: string) => number | null> {
  const series = new Map<string, { t: number; nav: number }[]>();
  for (const code of schemeCodes) {
    const rows = await ctx.db.all<{ date: string; nav: number }>('SELECT date, nav FROM nav_history WHERE scheme_code = ? ORDER BY date', code);
    series.set(code, rows.map((r) => ({ t: Date.parse(r.date), nav: r.nav })));
  }
  return (code, dateISO) => {
    const s = series.get(code);
    if (!s || s.length === 0) return null;
    const t = Date.parse(dateISO);
    let lo = 0;
    let hi = s.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.t <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans >= 0 ? s[ans]!.nav : null;
  };
}

// ── Goals ────────────────────────────────────────────────────────────
interface GoalRow {
  id: string;
  name: string;
  emoji: string;
  target_amount: number;
  target_date: string;
  current_amount: number;
  monthly_contribution: number;
  created_at: string;
}

const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  targetAmount: r.target_amount,
  targetDate: r.target_date,
  currentAmount: r.current_amount,
  monthlyContribution: r.monthly_contribution,
  createdAt: r.created_at,
});

export async function listGoals(ctx: AppContext, userId: string): Promise<Goal[]> {
  return (await ctx.db.all<GoalRow>('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at, id', userId)).map(toGoal);
}

export async function getGoal(ctx: AppContext, userId: string, id: string): Promise<Goal | undefined> {
  const r = await ctx.db.get<GoalRow>('SELECT * FROM goals WHERE user_id = ? AND id = ?', userId, id);
  return r ? toGoal(r) : undefined;
}

export async function createGoal(ctx: AppContext, userId: string, body: GoalBody): Promise<Goal> {
  const id = newId('goal');
  const now = nowISO(ctx);
  await ctx.db.run(
    `INSERT INTO goals (id, user_id, name, emoji, target_amount, target_date, current_amount, monthly_contribution, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, userId, body.name.trim(), body.emoji ?? '🎯', body.targetAmount, body.targetDate, body.currentAmount, body.monthlyContribution, now, now,
  );
  return (await getGoal(ctx, userId, id))!;
}

export async function updateGoal(ctx: AppContext, userId: string, id: string, body: Partial<GoalBody>): Promise<void> {
  const g = await getGoal(ctx, userId, id);
  if (!g) return;
  await ctx.db.run(
    `UPDATE goals SET name = ?, emoji = ?, target_amount = ?, target_date = ?, current_amount = ?, monthly_contribution = ?, updated_at = ?
     WHERE user_id = ? AND id = ?`,
    body.name?.trim() ?? g.name, body.emoji ?? g.emoji, body.targetAmount ?? g.targetAmount, body.targetDate ?? g.targetDate,
    body.currentAmount ?? g.currentAmount, body.monthlyContribution ?? g.monthlyContribution, nowISO(ctx), userId, id,
  );
}

export async function deleteGoal(ctx: AppContext, userId: string, id: string): Promise<boolean> {
  return (await ctx.db.run('DELETE FROM goals WHERE user_id = ? AND id = ?', userId, id)).changes > 0;
}

// ── Budgets ──────────────────────────────────────────────────────────
export async function listBudgets(ctx: AppContext, userId: string): Promise<Budget[]> {
  return (await ctx.db.all<{ id: string; category_id: CategoryId; monthly_limit: number }>('SELECT id, category_id, monthly_limit FROM budgets WHERE user_id = ? ORDER BY created_at, id', userId))
    .map((r) => ({ id: r.id, categoryId: r.category_id, monthlyLimit: r.monthly_limit }));
}

export async function upsertBudget(ctx: AppContext, userId: string, categoryId: CategoryId, monthlyLimit: number): Promise<void> {
  await ctx.db.run(
    `INSERT INTO budgets (id, user_id, category_id, monthly_limit, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, category_id) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
    newId('bud'), userId, categoryId, monthlyLimit, nowISO(ctx),
  );
}

export async function deleteBudget(ctx: AppContext, userId: string, categoryId: CategoryId): Promise<void> {
  await ctx.db.run('DELETE FROM budgets WHERE user_id = ? AND category_id = ?', userId, categoryId);
}

// ── Assumptions ──────────────────────────────────────────────────────
export const ASSUMPTION_KEYS = ['monthlyIncome', 'monthlyVariableSpend', 'safetyBuffer', 'mfReturnPct', 'epfRatePct', 'savingsRatePct', 'goalReturnPct'] as const;

export async function loadAssumptions(ctx: AppContext, userId: string): Promise<Partial<ForecastAssumptions>> {
  const out: Partial<ForecastAssumptions> = {};
  for (const r of await ctx.db.all<{ key: string; value: number }>('SELECT key, value FROM assumptions WHERE user_id = ?', userId)) {
    if ((ASSUMPTION_KEYS as readonly string[]).includes(r.key)) (out as Record<string, number>)[r.key] = r.value;
  }
  return out;
}

export async function setAssumption(ctx: AppContext, userId: string, key: (typeof ASSUMPTION_KEYS)[number], value: number | null): Promise<void> {
  if (value == null) await ctx.db.run('DELETE FROM assumptions WHERE user_id = ? AND key = ?', userId, key);
  else await ctx.db.run('INSERT INTO assumptions (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value', userId, key, value);
}

// ── Notifications ────────────────────────────────────────────────────
export async function notify(ctx: AppContext, userId: string, n: { kind: NotificationDTO['kind']; title: string; body: string; link?: string | null; dedupeKey: string }): Promise<void> {
  await ctx.db.run(
    'INSERT INTO notifications (id, user_id, kind, title, body, link, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, dedupe_key) DO NOTHING',
    newId('ntf'), userId, n.kind, n.title, n.body, n.link ?? null, n.dedupeKey, nowISO(ctx),
  );
}

export async function listNotifications(ctx: AppContext, userId: string, limit = 50): Promise<NotificationDTO[]> {
  return (await ctx.db
    .all<{ id: string; kind: NotificationDTO['kind']; title: string; body: string; created_at: string; read_at: string | null; link: string | null }>(
      'SELECT id, kind, title, body, created_at, read_at, link FROM notifications WHERE user_id = ? ORDER BY n DESC LIMIT ?',
      userId,
      limit,
    ))
    .map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, createdAt: r.created_at, readAt: r.read_at, link: r.link }));
}

export async function unreadCount(ctx: AppContext, userId: string): Promise<number> {
  return (await ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', userId))?.n ?? 0;
}

export async function markRead(ctx: AppContext, userId: string, id?: string): Promise<void> {
  if (id) await ctx.db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL', nowISO(ctx), userId, id);
  else await ctx.db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', nowISO(ctx), userId);
}

// ── SI conversations ─────────────────────────────────────────────────
/**
 * The chat the person was last active in: a just-started empty chat first, otherwise the chat with
 * the newest message. Ordered by the messages' insert sequence, so equal timestamps can't tie.
 */
async function latestConversation(ctx: AppContext, userId: string): Promise<{ id: string; messages: number } | undefined> {
  const row = await ctx.db.get<{ id: string; messages: number }>(
    `SELECT c.id, count(m.id)::int AS messages FROM si_conversations c
     LEFT JOIN si_messages m ON m.conversation_id = c.id
     WHERE c.user_id = ? GROUP BY c.id, c.created_at
     ORDER BY (count(m.id) = 0) DESC, max(m.n) DESC NULLS LAST, c.created_at DESC LIMIT 1`,
    userId,
  );
  return row ? { id: row.id, messages: Number(row.messages) } : undefined;
}

export async function getOrCreateConversation(ctx: AppContext, userId: string, id?: string): Promise<string> {
  if (id) {
    const row = await ctx.db.get<{ id: string }>('SELECT id FROM si_conversations WHERE user_id = ? AND id = ?', userId, id);
    if (row) return row.id;
  }
  // An unknown id (deleted chat, another person's) falls back to the latest chat.
  const latest = await latestConversation(ctx, userId);
  if (latest) return latest.id;
  return createConversation(ctx, userId);
}

async function createConversation(ctx: AppContext, userId: string): Promise<string> {
  const conv = newId('conv');
  await ctx.db.run('INSERT INTO si_conversations (id, user_id, created_at) VALUES (?, ?, ?)', conv, userId, nowISO(ctx));
  return conv;
}

/** Starts a new chat; the old ones stay in history. An existing empty chat is reused, so no blanks pile up. */
export async function newConversation(ctx: AppContext, userId: string): Promise<string> {
  const empty = await ctx.db.get<{ id: string }>(
    'SELECT c.id FROM si_conversations c WHERE c.user_id = ? AND NOT EXISTS (SELECT 1 FROM si_messages m WHERE m.conversation_id = c.id) LIMIT 1',
    userId,
  );
  return empty?.id ?? createConversation(ctx, userId);
}

/** Past chats, most recently active first, titled by their first question. Empty chats are left out. */
export async function listConversations(ctx: AppContext, userId: string, limit = 100): Promise<SIConversationDTO[]> {
  const rows = await ctx.db.all<{ id: string; last_at: string; messages: number }>(
    `SELECT c.id, max(m.created_at) AS last_at, count(m.id)::int AS messages FROM si_conversations c
     JOIN si_messages m ON m.conversation_id = c.id
     WHERE c.user_id = ? GROUP BY c.id ORDER BY max(m.n) DESC LIMIT ?`,
    userId, limit,
  );
  if (!rows.length) return [];
  const firsts = await ctx.db.all<{ conversation_id: string; payload_enc: string }>(
    `SELECT DISTINCT ON (conversation_id) conversation_id, payload_enc FROM si_messages
     WHERE user_id = ? AND role = 'user' ORDER BY conversation_id, n`,
    userId,
  );
  const titles = new Map(firsts.map((f) => [f.conversation_id, (JSON.parse(ctx.vault.decrypt(f.payload_enc)) as SIMessageDTO).text]));
  return rows.map((r) => ({ id: r.id, title: (titles.get(r.id) ?? 'Conversation').slice(0, 120), lastAt: r.last_at, messageCount: Number(r.messages) }));
}

export async function deleteConversation(ctx: AppContext, userId: string, id: string): Promise<void> {
  await ctx.db.run('DELETE FROM si_messages WHERE user_id = ? AND conversation_id = ?', userId, id);
  await ctx.db.run('DELETE FROM si_conversations WHERE user_id = ? AND id = ?', userId, id);
}

export async function saveMessage(ctx: AppContext, userId: string, conversationId: string, msg: Omit<SIMessageDTO, 'id' | 'createdAt'>): Promise<SIMessageDTO> {
  const id = newId('msg');
  const createdAt = nowISO(ctx);
  await ctx.db.run(
    'INSERT INTO si_messages (id, conversation_id, user_id, role, payload_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, conversationId, userId, msg.role, ctx.vault.encrypt(JSON.stringify(msg)), createdAt,
  );
  return { ...msg, id, createdAt };
}

export async function listMessages(ctx: AppContext, userId: string, conversationId: string, limit = 40): Promise<SIMessageDTO[]> {
  const rows = await ctx.db.all<{ id: string; payload_enc: string; created_at: string }>(
    'SELECT id, payload_enc, created_at FROM si_messages WHERE user_id = ? AND conversation_id = ? ORDER BY n DESC LIMIT ?',
    userId, conversationId, limit,
  );
  return rows.reverse().map((r) => ({ ...(JSON.parse(ctx.vault.decrypt(r.payload_enc)) as SIMessageDTO), id: r.id, createdAt: r.created_at }));
}

