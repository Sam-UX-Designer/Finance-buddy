// Builds the Vercel deployment (Build Output API v3):
//   static/            → the Expo web app (single-page app)
//   functions/api.func → the Hono API as one Node.js function, served under /api
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '.vercel/output');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env: process.env });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Web app (with real brand logos downloaded at build time; the build continues if that fails)
try {
  run('node scripts/fetch-logos.mjs');
} catch {
  console.warn('Logo download failed; the app will use its fallback icons.');
}
const mobile = join(root, 'apps/mobile');
rmSync(join(mobile, 'dist'), { recursive: true, force: true });
run('npx expo export --platform web --output-dir dist', mobile);
cpSync(join(mobile, 'dist'), join(out, 'static'), { recursive: true });

// 2. API function
const fn = join(out, 'functions/api.func');
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, 'apps/api/src/vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  // PGlite is the local/test database only; production uses Supabase Postgres.
  external: ['@electric-sql/pglite'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 60 }, null, 2),
);
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));

// 3. Routing: /api/* → function, real files → static, everything else → the app shell.
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { src: '^/_expo/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('Vercel output ready:', out);
