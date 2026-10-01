import type { Config } from './config';
import type { Db } from './db';
import type { Vault } from './lib/crypto';
import type { AAProvider, MarketDataProvider } from './aa/provider';
import type { MockAAProvider } from './aa/mock/provider';
import type { SmsProvider } from './auth/sms';
import type { SILanguageModel } from './si/llm';

/** Shared dependencies. Everything that touches the outside world is injectable for tests. */
export interface AppContext {
  config: Config;
  db: Db;
  vault: Vault;
  aa: AAProvider;
  /** Present only when the sandbox provider is active (enables the sandbox approval endpoints). */
  mockAA: MockAAProvider | null;
  market: MarketDataProvider;
  sms: SmsProvider;
  llm: SILanguageModel | null;
  now: () => Date;
  log: (level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) => void;
}

export const nowISO = (ctx: Pick<AppContext, 'now'>) => ctx.now().toISOString();
