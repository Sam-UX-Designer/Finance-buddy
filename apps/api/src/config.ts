import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_PATH: z.string().default('./data/moneymate.db'),
  DATA_ENCRYPTION_KEY: z.string().optional().default(''),
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
    if (config.SMS_PROVIDER === 'dev') throw new Error('The dev SMS provider cannot be used in production');
    if (config.AA_PROVIDER === 'mock') throw new Error('The mock AA provider cannot be used in production');
    if (config.AA_WEBHOOK_SECRET === 'change-me') throw new Error('AA_WEBHOOK_SECRET must be set in production');
  }
  return config;
}
