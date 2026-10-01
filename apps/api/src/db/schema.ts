/**
 * Postgres schema — the single source of truth for local (PGlite), tests and Supabase.
 * Supabase-only security (API role, row-level security) lives in `supabase/migrations`.
 * Amounts are integer paise (bigint); timestamps are ISO-8601 UTC text for exact round-trips.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '0001_init',
    sql: `
  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    phone_hash text NOT NULL UNIQUE,
    phone_enc text NOT NULL,
    phone_last4 text NOT NULL,
    name_enc text,
    onboarding_state text NOT NULL,
    theme_preference text NOT NULL DEFAULT 'system',
    data_version bigint NOT NULL DEFAULT 0,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS otp_challenges (
    id text PRIMARY KEY,
    phone_hash text NOT NULL,
    phone_enc text NOT NULL,
    code_hash text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at text NOT NULL,
    resend_after text NOT NULL,
    consumed_at text,
    created_at text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS otp_phone ON otp_challenges(phone_hash, created_at);
  CREATE TABLE IF NOT EXISTS device_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    device_name text NOT NULL,
    platform text NOT NULL,
    created_at text NOT NULL,
    last_seen_at text NOT NULL,
    expires_at text NOT NULL,
    revoked_at text
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON device_sessions(user_id);
  CREATE TABLE IF NOT EXISTS consents (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_consent_id text NOT NULL UNIQUE,
    status text NOT NULL,
    purpose_code text NOT NULL,
    purpose text NOT NULL,
    fi_types text NOT NULL,
    data_from text NOT NULL,
    data_to text NOT NULL,
    expires_at text NOT NULL,
    fetch_type text NOT NULL,
    frequency text NOT NULL,
    account_ids text NOT NULL,
    approval_url text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS consents_user ON consents(user_id);
  CREATE TABLE IF NOT EXISTS consent_events (
    id text PRIMARY KEY,
    consent_id text NOT NULL,
    user_id text NOT NULL,
    event text NOT NULL,
    detail text,
    created_at text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accounts (
    n bigint GENERATED ALWAYS AS IDENTITY,
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_ref text NOT NULL,
    fip_id text NOT NULL,
    type text NOT NULL,
    masked_number text NOT NULL,
    display_name text NOT NULL,
    linked integer NOT NULL DEFAULT 0,
    current_balance bigint NOT NULL DEFAULT 0,
    balance_as_of text,
    last_synced_at text,
    sync_status text NOT NULL DEFAULT 'PENDING',
    consent_id text,
    holder_name_enc text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    UNIQUE (user_id, provider_ref)
  );
  CREATE TABLE IF NOT EXISTS data_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_id text NOT NULL,
    provider_session_id text NOT NULL,
    status text NOT NULL,
    data_from text NOT NULL,
    data_to text NOT NULL,
    error text,
    created_at text NOT NULL,
    completed_at text
  );
  CREATE TABLE IF NOT EXISTS jobs (
    n bigint GENERATED ALWAYS AS IDENTITY,
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    status text NOT NULL,
    steps text NOT NULL,
    error text,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_user_kind ON jobs(user_id, kind, n DESC);
  CREATE TABLE IF NOT EXISTS transactions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    dedupe_key text NOT NULL,
    posted_at text NOT NULL,
    seq integer NOT NULL DEFAULT 0,
    amount bigint NOT NULL,
    direction text NOT NULL,
    mode text NOT NULL,
    narration_enc text NOT NULL,
    reference_enc text,
    merchant_key text NOT NULL,
    merchant_name text NOT NULL,
    counterparty_enc text,
    category_id text NOT NULL,
    type text NOT NULL,
    confidence double precision NOT NULL,
    type_source text NOT NULL,
    category_source text NOT NULL,
    is_recurring integer NOT NULL DEFAULT 0,
    recurring_source text,
    balance_after bigint,
    note_enc text,
    splits text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    UNIQUE (user_id, dedupe_key)
  );
  CREATE INDEX IF NOT EXISTS tx_user_posted ON transactions(user_id, posted_at);
  CREATE INDEX IF NOT EXISTS tx_account ON transactions(account_id);
  CREATE TABLE IF NOT EXISTS user_rules (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_key text NOT NULL,
    category_id text,
    type text,
    created_at text NOT NULL,
    PRIMARY KEY (user_id, merchant_key)
  );
  CREATE TABLE IF NOT EXISTS corrections (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id text NOT NULL,
    field text NOT NULL,
    old_value text,
    new_value text,
    created_at text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS holdings (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind text NOT NULL,
    data_enc text NOT NULL,
    updated_at text NOT NULL,
    UNIQUE (account_id, kind)
  );
  CREATE TABLE IF NOT EXISTS nav_history (
    scheme_code text NOT NULL,
    date text NOT NULL,
    nav double precision NOT NULL,
    PRIMARY KEY (scheme_code, date)
  );
  CREATE TABLE IF NOT EXISTS goals (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    emoji text NOT NULL,
    target_amount bigint NOT NULL,
    target_date text NOT NULL,
    current_amount bigint NOT NULL,
    monthly_contribution bigint NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id text NOT NULL,
    monthly_limit bigint NOT NULL,
    created_at text NOT NULL,
    UNIQUE (user_id, category_id)
  );
  CREATE TABLE IF NOT EXISTS assumptions (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key text NOT NULL,
    value double precision NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE TABLE IF NOT EXISTS si_conversations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS si_messages (
    n bigint GENERATED ALWAYS AS IDENTITY,
    id text PRIMARY KEY,
    conversation_id text NOT NULL REFERENCES si_conversations(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL,
    payload_enc text NOT NULL,
    created_at text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS si_messages_conv ON si_messages(conversation_id, n);
  CREATE TABLE IF NOT EXISTS notifications (
    n bigint GENERATED ALWAYS AS IDENTITY,
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    link text,
    dedupe_key text NOT NULL,
    created_at text NOT NULL,
    read_at text,
    UNIQUE (user_id, dedupe_key)
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    id text PRIMARY KEY,
    user_id text,
    event text NOT NULL,
    detail text,
    created_at text NOT NULL
  );
  -- Provider-side state of the sandbox Account Aggregator (a real AA keeps this on its side).
  CREATE TABLE IF NOT EXISTS sandbox_aa_consents (
    provider_consent_id text PRIMARY KEY,
    input text NOT NULL,
    status text NOT NULL,
    updated_at text NOT NULL
  );
  `,
  },
];
