import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ConsentStatus } from '@finance-buddy/core';
import type { Config } from './config';
import { nowISO, type AppContext } from './context';
import { Db, pgliteDriver, postgresDriver } from './db';
import { Vault } from './lib/crypto';
import { MockAAProvider, type SandboxConsentStore } from './aa/mock/provider';
import type { CreateConsentInput } from './aa/provider';
import { DevSmsProvider } from './auth/sms';
import { ClaudeSI } from './si/llm';

function encryptionKey(config: Config): string {
  if (config.DATA_ENCRYPTION_KEY) return config.DATA_ENCRYPTION_KEY;
  if (config.DATABASE_PATH === ':memory:') return randomBytes(32).toString('base64');
  // Development only: generate a local key next to the database.
  const file = join(dirname(config.DATABASE_PATH), '.dev-key');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return readFileSync(file, 'utf8').trim();
}

/** Sandbox AA consent records, encrypted (they contain the phone number). */
function sandboxStore(ctx: Pick<AppContext, 'db' | 'vault' | 'now'>): SandboxConsentStore {
  return {
    async get(id) {
      const row = await ctx.db.get<{ input: string; status: ConsentStatus }>('SELECT input, status FROM sandbox_aa_consents WHERE provider_consent_id = ?', id);
      return row ? { input: JSON.parse(ctx.vault.decrypt(row.input)) as CreateConsentInput, status: row.status } : null;
    },
    async put(id, input, status) {
      await ctx.db.run(
        `INSERT INTO sandbox_aa_consents (provider_consent_id, input, status, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (provider_consent_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        id, ctx.vault.encrypt(JSON.stringify(input)), status, nowISO(ctx),
      );
    },
    async remove(id) {
      await ctx.db.run('DELETE FROM sandbox_aa_consents WHERE provider_consent_id = ?', id);
    },
  };
}

export async function buildContext(config: Config, overrides: Partial<AppContext> = {}): Promise<AppContext> {
  const log: AppContext['log'] = (level, msg, extra) => {
    if (config.NODE_ENV === 'test' && level !== 'error') return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
  const now = overrides.now ?? (() => new Date());
  const driver = config.DATABASE_URL
    ? await postgresDriver(config.DATABASE_URL)
    : await pgliteDriver(config.DATABASE_PATH === ':memory:' ? undefined : config.DATABASE_PATH);
  const db = new Db(driver);
  if (config.AUTO_MIGRATE || !config.DATABASE_URL) await db.migrate();
  const vault = new Vault(encryptionKey(config));
  const mock = new MockAAProvider({
    latencyMs: config.MOCK_AA_LATENCY_MS,
    failFips: config.MOCK_AA_FAIL_FIPS.split(',').map((s) => s.trim()).filter(Boolean),
    store: sandboxStore({ db, vault, now }),
    now,
  });
  return {
    config,
    db,
    vault,
    aa: mock,
    mockAA: mock,
    market: mock,
    sms: new DevSmsProvider(config.OTP_DEV_FIXED_CODE || null, (m) => log('info', m)),
    llm: config.ANTHROPIC_API_KEY ? new ClaudeSI(config.ANTHROPIC_API_KEY, config.SI_MODEL, (m, e) => log('warn', m, e)) : null,
    now,
    background: (work) => {
      void work.catch((e) => log('error', 'background task failed', { error: String(e) }));
    },
    log,
    ...overrides,
  };
}
