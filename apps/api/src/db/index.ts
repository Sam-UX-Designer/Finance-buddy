import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * Thin wrapper around Node's built-in SQLite. The repository layer is the only code that writes SQL,
 * so moving to Postgres later means replacing this module and the repositories, nothing else.
 */
export class Db {
  readonly raw: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(this.raw);
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SQLInputValue[]): { changes: number } {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    this.raw.close();
  }
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    phone_hash TEXT NOT NULL UNIQUE,
    phone_enc TEXT NOT NULL,
    phone_last4 TEXT NOT NULL,
    name_enc TEXT,
    onboarding_state TEXT NOT NULL,
    theme_preference TEXT NOT NULL DEFAULT 'system',
    data_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE otp_challenges (
    id TEXT PRIMARY KEY,
    phone_hash TEXT NOT NULL,
    phone_enc TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    resend_after TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX otp_phone ON otp_challenges(phone_hash, created_at);
  CREATE TABLE device_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE TABLE consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_consent_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    purpose_code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    fi_types TEXT NOT NULL,
    data_from TEXT NOT NULL,
    data_to TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    fetch_type TEXT NOT NULL,
    frequency TEXT NOT NULL,
    account_ids TEXT NOT NULL,
    approval_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE consent_events (
    id TEXT PRIMARY KEY,
    consent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_ref TEXT NOT NULL,
    fip_id TEXT NOT NULL,
    type TEXT NOT NULL,
    masked_number TEXT NOT NULL,
    display_name TEXT NOT NULL,
    linked INTEGER NOT NULL DEFAULT 0,
    current_balance INTEGER NOT NULL DEFAULT 0,
    balance_as_of TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'PENDING',
    consent_id TEXT,
    holder_name_enc TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, provider_ref)
  );
  CREATE TABLE data_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_id TEXT NOT NULL,
    provider_session_id TEXT NOT NULL,
    status TEXT NOT NULL,
    data_from TEXT NOT NULL,
    data_to TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    steps TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    dedupe_key TEXT NOT NULL,
    posted_at TEXT NOT NULL,
    amount INTEGER NOT NULL,
    direction TEXT NOT NULL,
    mode TEXT NOT NULL,
    narration_enc TEXT NOT NULL,
    reference_enc TEXT,
    merchant_key TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    counterparty_enc TEXT,
    category_id TEXT NOT NULL,
    type TEXT NOT NULL,
    confidence REAL NOT NULL,
    type_source TEXT NOT NULL,
    category_source TEXT NOT NULL,
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurring_source TEXT,
    balance_after INTEGER,
    note_enc TEXT,
    splits TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, dedupe_key)
  );
  CREATE INDEX tx_user_posted ON transactions(user_id, posted_at DESC);
  CREATE TABLE user_rules (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_key TEXT NOT NULL,
    category_id TEXT,
    type TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, merchant_key)
  );
  CREATE TABLE corrections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE holdings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    data_enc TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(account_id, kind)
  );
  CREATE TABLE nav_history (
    scheme_code TEXT NOT NULL,
    date TEXT NOT NULL,
    nav REAL NOT NULL,
    PRIMARY KEY (scheme_code, date)
  );
  CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    target_amount INTEGER NOT NULL,
    target_date TEXT NOT NULL,
    current_amount INTEGER NOT NULL,
    monthly_contribution INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    monthly_limit INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, category_id)
  );
  CREATE TABLE assumptions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE TABLE si_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE si_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES si_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    payload_enc TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    dedupe_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE(user_id, dedupe_key)
  );
  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    event TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE transactions ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
  `,
];

function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  const current = row.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]!);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(i + 1, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}
