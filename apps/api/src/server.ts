import { serve } from '@hono/node-server';
import { createApp } from './app';
import { buildContext } from './bootstrap';
import { loadConfig } from './config';

const config = loadConfig();
const ctx = buildContext(config);
const app = createApp(ctx);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  ctx.log('info', `MoneyMate API listening on http://localhost:${info.port}`, {
    aa: ctx.aa.name,
    sms: ctx.sms.name,
    si: ctx.llm ? `claude (${config.SI_MODEL})` : 'deterministic',
  });
});

const shutdown = () => {
  server.close();
  ctx.db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
