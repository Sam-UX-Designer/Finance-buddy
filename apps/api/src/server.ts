import { serve } from '@hono/node-server';
import { createApp } from './app';
import { buildContext } from './bootstrap';
import { loadConfig } from './config';

const config = loadConfig();
const ctx = await buildContext(config);
const app = createApp(ctx);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  ctx.log('info', `Finance Buddy API listening on http://localhost:${info.port}`, {
    database: config.DATABASE_URL ? 'postgres' : 'pglite (local)',
    aa: ctx.aa.name,
    si: ctx.llm ? `claude (${config.SI_MODEL})` : 'deterministic',
  });
});

const shutdown = async () => {
  server.close();
  await ctx.db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
