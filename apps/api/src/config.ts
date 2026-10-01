import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Supabase Postgres connection string (pooler). Empty → local PGlite database. */
  DATABASE_URL: z.string().default(''),
  /** Local PGlite data directory (used when DATABASE_URL is empty). ':memory:' for an in-memory database. */
  DATABASE_PATH: z.string().default('./data/pglite'),
  /** Run schema migrations at startup (local/test). Supabase is migrated from supabase/migrations. */
  AUTO_MIGRATE: bool,
  DATA_ENCRYPTION_KEY: z.string().optional().default(''),
  /**
   * Sandbox mode: test Account Aggregator persona + fixed development OTP. Allowed in a deployed
   * environment only when explicitly enabled; the app labels itself as sandbox.
   */
  SANDBOX_MODE: bool,
  SMS_PROVIDER: z.enum(['dev']).default('dev'),
  OTP_DEV_FIXED_CODE: z.string().regex(/^\d{6}$/).optional().or(z.literal('')).default('123456'),
  AA_PROVIDER: z.enum(['mock']).default('mock'),
  MOCK_AA_LATENCY_MS: z.coerce.number().default(1500),
  MOCK_AA_FAIL_FIPS: z.string().default(''),
  AA_WEBHOOK_SECRET: z.string().default('change-me'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  SI_MODEL: z.string().default('claude-opus-5-5'),
  CORS_ORIGINS: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production') {
    if (!config.DATA_ENCRYPTION_KEY) throw new Error('DATA_ENCRYPTION_KEY is required in production');
    if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
    if (config.AA_WEBHOOK_SECRET === 'change-me') throw new Error('AA_WEBHOOK_SECRET must be set in production');
    if (!config.SANDBOX_MODE && (config.SMS_PROVIDER === 'dev' || config.AA_PROVIDER === 'mock')) {
      throw new Error('Development OTP and the sandbox AA are only allowed with SANDBOX_MODE=true');
    }
  }
  return config;
}
