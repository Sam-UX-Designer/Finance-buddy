import { mkdirSync } from 'node:fs';
import { MIGRATIONS } from './schema';

/**
 * Minimal async SQL interface shared by the two drivers:
 *  - `postgres` (porsager) → Supabase Postgres in production (via the Supavisor pooler),
 *  - PGlite → real Postgres in-process for local development and tests.
 * Repositories write SQL with `?` placeholders; they are converted to `$n` here.
 */
export interface Driver {
  query(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[]; count: number }>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (d: Driver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const placeholderCache = new Map<string, string>();
function toPg(sql: string): string {
  let out = placeholderCache.get(sql);
  if (!out) {
    let i = 0;
    out = sql.replace(/\?/g, () => `$${++i}`);
    placeholderCache.set(sql, out);
  }
  return out;
}

export class Db {
  constructor(private driver: Driver) {}

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return (await this.driver.query(toPg(sql), params)).rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return (await this.driver.query(toPg(sql), params)).rows as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    return { changes: (await this.driver.query(toPg(sql), params)).count };
  }

  /** Runs `fn` in a transaction. Use only the `tx` handle inside — never the outer Db. */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.driver.transaction((d) => fn(new Db(d)));
  }

  exec(sql: string): Promise<void> {
    return this.driver.exec(sql);
  }

  close(): Promise<void> {
    return this.driver.close();
  }

  /** Applies schema migrations (local/test). Supabase is migrated via `supabase/migrations`. */
  async migrate(): Promise<void> {
    await this.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at text NOT NULL)');
    for (const m of MIGRATIONS) {
      const done = await this.get<{ name: string }>('SELECT name FROM schema_migrations WHERE name = ?', m.name);
      if (done) continue;
      await this.tx(async (tx) => {
        await tx.exec(m.sql);
        await tx.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', m.name, new Date().toISOString());
      });
    }
  }
}

/** int8 (bigint) columns and COUNT(*) → JS number (safe for paise up to ±9e15). */
const toNumber = (v: string) => Number(v);

export async function pgliteDriver(dataDir?: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir, { parsers: { 20: toNumber } });
  const wrap = (q: { query: typeof pg.query; exec: typeof pg.exec }): Omit<Driver, 'transaction' | 'close'> => ({
    async query(text, params) {
      const r = await q.query<Record<string, unknown>>(text, params as unknown[]);
      return { rows: r.rows, count: r.affectedRows ?? r.rows.length };
    },
    async exec(text) {
      await q.exec(text);
    },
  });
  const base = wrap(pg);
  return {
    ...base,
    transaction: (fn) =>
      pg.transaction((tx) =>
        fn({
          ...wrap(tx as unknown as { query: typeof pg.query; exec: typeof pg.exec }),
          transaction: () => Promise.reject(new Error('Nested transactions are not supported')),
          close: async () => undefined,
        }),
      ),
    close: () => pg.close(),
  };
}

export async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    prepare: false, // required by the Supavisor transaction pooler
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: url.includes('localhost') ? false : 'require',
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: toNumber } },
    onnotice: () => undefined,
  });
  type Q = { unsafe: typeof sql.unsafe };
  const wrap = (q: Q): Omit<Driver, 'transaction' | 'close'> => ({
    async query(text, params) {
      const r = await q.unsafe(text, params as never[]);
      return { rows: [...r] as Record<string, unknown>[], count: r.count ?? 0 };
    },
    async exec(text) {
      await q.unsafe(text).simple();
    },
  });
  return {
    ...wrap(sql),
    transaction: (fn) =>
      sql.begin((tx) =>
        fn({
          ...wrap(tx as unknown as Q),
          transaction: () => Promise.reject(new Error('Nested transactions are not supported')),
          close: async () => undefined,
        }),
      ) as Promise<never>,
    close: () => sql.end({ timeout: 5 }),
  };
}
