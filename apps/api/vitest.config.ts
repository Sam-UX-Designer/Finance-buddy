import { defineConfig } from 'vitest/config';

// Each test boots an in-memory Postgres (PGlite) and runs migrations, which takes a few seconds.
export default defineConfig({ test: { testTimeout: 30_000 } });
