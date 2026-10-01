import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { waitUntil } from '@vercel/functions';
import { createApp } from './app';
import { buildContext } from './bootstrap';
import { loadConfig } from './config';

/**
 * Vercel Function entry. The web app and the API share one domain; the API lives under /api.
 * Initialised once per instance and reused across requests.
 */
let listener: Promise<ReturnType<typeof getRequestListener>> | null = null;

async function init() {
  // Always production rules on Vercel (secrets required; sandbox only with SANDBOX_MODE=true).
  const ctx = await buildContext(loadConfig({ ...process.env, NODE_ENV: 'production' }));
  // Keep sync/discovery jobs running after the response is sent.
  ctx.background = (work) => waitUntil(work.catch((e) => ctx.log('error', 'background task failed', { error: String(e) })));
  return getRequestListener(createApp(ctx, { basePath: '/api' }).fetch);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  listener ??= init().catch((e) => {
    listener = null;
    throw e;
  });
  try {
    await (await listener)(req, res);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'API failed to start', error: String(e) }));
    if (!res.headersSent) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Finance Buddy is starting up. Please try again in a moment.' } }));
    }
  }
}
