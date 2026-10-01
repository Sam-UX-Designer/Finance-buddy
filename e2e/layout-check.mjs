// Visual check of the phone and desktop layouts (Home, SI, Activity) in light and dark.
// Usage: node e2e/layout-check.mjs [webUrl] [outDir]   (API on :4000, web build served on webUrl)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const WEB = process.argv[2] ?? 'http://localhost:8081';
const OUT = process.argv[3] ?? new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await playwright.chromium.launch();
const errors = [];
const vis = (l) => l.filter({ visible: true }).last();

async function signedIn(viewport, colorScheme) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WEB);
  await vis(page.getByLabel('Mobile number')).fill(`9${Math.floor(100000000 + Math.random() * 899999999)}`, { timeout: 20000 });
  await vis(page.getByRole('button', { name: 'Continue' })).click();
  await vis(page.getByLabel('One-time code')).fill('123456');
  await page.getByText('We found your').first().waitFor({ timeout: 20000 });
  await vis(page.getByRole('button', { name: /Continue \(\d+ selected\)/ })).click();
  await vis(page.getByRole('button', { name: 'Approve & connect' })).click();
  await page.getByText('You’re all set').first().waitFor({ timeout: 30000 });
  await vis(page.getByRole('button', { name: /Go to|Continue|Open|Start|home/i })).click().catch(() => {});
  await page.getByText('Total Balance').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await signedIn({ width: 390, height: 844 }, scheme);
  await page.screenshot({ path: `${OUT}/m-${scheme}-home-top.png` });
  await page.mouse.move(195, 420);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/m-${scheme}-home-mid.png` });
  await page.mouse.move(195, 420);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/m-${scheme}-home-end.png` });
  await vis(page.getByRole('tab', { name: 'SI' })).click();
  await page.getByText('Super Intelligence').first().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/m-${scheme}-si.png` });
  await vis(page.getByRole('button', { name: /How much can I invest/ })).click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/m-${scheme}-si-answer.png` });
  await vis(page.getByRole('tab', { name: 'Activity' })).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/m-${scheme}-activity.png` });
  await ctx.close();
}
{
  const { ctx, page } = await signedIn({ width: 1440, height: 900 }, 'light');
  await page.screenshot({ path: `${OUT}/d-light-home.png` });
  await vis(page.getByRole('link', { name: 'Super Intelligence' })).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/d-light-si.png` });
  await vis(page.getByRole('link', { name: 'Activity' })).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/d-light-activity.png` });
  await ctx.close();
}
{
  const { ctx, page } = await signedIn({ width: 1440, height: 900 }, 'dark');
  await page.screenshot({ path: `${OUT}/d-dark-home.png` });
  await ctx.close();
}
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
