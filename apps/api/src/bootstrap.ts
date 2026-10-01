import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Config } from './config';
import type { AppContext } from './context';
import { Db } from './db';
import { Vault } from './lib/crypto';
import { MockAAProvider } from './aa/mock/provider';
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

export function buildContext(config: Config, overrides: Partial<AppContext> = {}): AppContext {
  const log: AppContext['log'] = (level, msg, extra) => {
    if (config.NODE_ENV === 'test' && level !== 'error') return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
  const now = overrides.now ?? (() => new Date());
  const mock = new MockAAProvider({
    latencyMs: config.MOCK_AA_LATENCY_MS,
    failFips: config.MOCK_AA_FAIL_FIPS.split(',').map((s) => s.trim()).filter(Boolean),
    now,
  });
  return {
    config,
    db: new Db(config.DATABASE_PATH),
    vault: new Vault(encryptionKey(config)),
    aa: mock,
    mockAA: mock,
    market: mock,
    sms: new DevSmsProvider(config.OTP_DEV_FIXED_CODE || null, (m) => log('info', m)),
    llm: config.ANTHROPIC_API_KEY ? new ClaudeSI(config.ANTHROPIC_API_KEY, config.SI_MODEL, (m, e) => log('warn', m, e)) : null,
    now,
    log,
    ...overrides,
  };
}
